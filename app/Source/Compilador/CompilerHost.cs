using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using Android.Content;
using BunnyLoader.Compiler;

namespace BunnyStudio;

/// <summary>
/// Sem logica propria de compilacao: grava as fontes e chama o ModCompiler do Bunny Loader, com
/// as referencias do Bunny instalado. Uma unica fila, em uma thread com pilha grande para o Roslyn.
/// </summary>
public sealed class CompilerHost
{
    private const int StackBytes = 64 * 1024 * 1024;
    private readonly BlockingCollection<(int Id, string Json)> jobs = new();
    private readonly Action<int, string> done;
    private readonly Context context;
    private readonly string projects;

    public CompilerHost(Context context, Action<int, string> done)
    {
        this.context = context;
        this.done = done;
        projects = Path.Combine(context.FilesDir!.AbsolutePath, "compiler", "projects");
        new Thread(Loop, StackBytes) { IsBackground = true, Name = "BunnyCompiler" }.Start();
    }

    public void Enqueue(int id, string json) => jobs.Add((id, json));

    private void Loop()
    {
        foreach (var job in jobs.GetConsumingEnumerable())
        {
            string result;
            try
            {
                result = Compile(job.Json);
            }
            catch (Exception error)
            {
                result = Reply(-100, "HOST_EXCEPTION " + error);
            }
            done(job.Id, result);
        }
    }

    private static string Reply(int code, string diagnostics) => JsonSerializer.Serialize(new Dictionary<string, object>
    {
        ["code"] = code, ["errors"] = Array.Empty<string>(), ["warnings"] = Array.Empty<string>(),
        ["bytes"] = 0, ["diagnostics"] = diagnostics, ["assembly"] = "",
    });

    private string Compile(string json)
    {
        IReadOnlyList<string>? references = BunnyPackage.References(context);
        if (references == null)
            return Reply(BunnyPackage.Find(context) == null ? -50 : -51, "BUNNY_REFERENCES_UNAVAILABLE");

        using JsonDocument document = JsonDocument.Parse(json);
        string entry = document.RootElement.GetProperty("entry").GetString()!;
        if (entry != Path.GetFileName(entry) || !entry.EndsWith(".cs", StringComparison.Ordinal))
            throw new ArgumentException("Arquivo de entrada invalido: " + entry);
        string project = Path.Combine(projects, Path.GetFileNameWithoutExtension(entry));
        SyncSources(project, document.RootElement.GetProperty("files"));

        BuildResult result = ModCompiler.Build(project, entry, references);
        byte[] assembly = result.Success && File.Exists(result.DllPath) ? File.ReadAllBytes(result.DllPath) : Array.Empty<byte>();
        return JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["code"] = !result.Success ? -1 : result.Compiled ? 1 : 2,
            ["errors"] = result.Errors,
            ["warnings"] = result.Warnings,
            ["files"] = result.Files,
            ["lines"] = result.Lines,
            ["ms"] = result.Milliseconds,
            ["bytes"] = assembly.Length,
            ["diagnostics"] = result.ToReport(),
            ["assembly"] = Convert.ToBase64String(assembly),
        });
    }

    /// <summary>Mantem a pasta igual ao mod. A pasta bin fica: e nela que o ModCompiler guarda o cache.</summary>
    private static void SyncSources(string project, JsonElement files)
    {
        string root = Path.GetFullPath(project) + "/";
        Directory.CreateDirectory(root);
        var wanted = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonProperty file in files.EnumerateObject())
        {
            string target = Path.GetFullPath(root + file.Name);
            if (!target.StartsWith(root, StringComparison.Ordinal))
                throw new ArgumentException("Caminho fora do mod: " + file.Name);
            wanted.Add(target);
            string text = file.Value.GetString() ?? "";
            if (File.Exists(target) && File.ReadAllText(target) == text) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.WriteAllText(target, text, new UTF8Encoding(false));
        }
        foreach (string existing in Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories).ToList())
        {
            string relative = existing[root.Length..];
            if (relative.StartsWith("bin/", StringComparison.Ordinal) || relative.StartsWith("obj/", StringComparison.Ordinal)) continue;
            if (!wanted.Contains(existing)) File.Delete(existing);
        }
    }
}
