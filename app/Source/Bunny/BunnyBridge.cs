using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using Android.Content;
using Android.Content.PM;
using Android.Database;
using Android.OS;
using Android.Provider;

namespace BunnyStudio;

/// <summary>
/// Acesso a pasta ModSources do Bunny, pelo mesmo caminho do BL Editor: a activity de ponte entrega
/// uma permissao de pasta (SAF) e o provider instala o projeto. Sem a ponte, a pessoa escolhe a pasta.
/// </summary>
public sealed class BunnyBridge
{
    // O beta do Bunny tem pacote proprio, e o provider dele segue esse nome.
    private string Package => BunnyPackage.Find(context)?.Package ?? BunnyPackage.Packages[0];
    private string DocumentsAuthority => Package + ".documents";
    private const string RootId = "mod-sources";
    private const string BridgeActivity = "dev.bunnyloader.EditorBridgeActivity";
    private const string ConnectAction = "com.bunnyloader.action.CONNECT_EDITOR";
    private const string PrefsName = "bunny-bridge";
    private static readonly string[] Ignored = { "bin", "obj", "build" };
    private static readonly string[] TextExtensions = { ".cs", ".json", ".hjson", ".md", ".txt", ".frag", ".vert", ".glsl" };

    private readonly Context context;
    private readonly Action<int, string> done;
    private readonly BlockingCollection<(int Id, string Op, string Json)> jobs = new();

    public BunnyBridge(Context context, Action<int, string> done)
    {
        this.context = context;
        this.done = done;
        new Thread(Loop) { IsBackground = true, Name = "BunnyBridge" }.Start();
    }

    private ISharedPreferences Prefs => context.GetSharedPreferences(PrefsName, FileCreationMode.Private)!;
    private Android.Net.Uri? Tree
    {
        get
        {
            string? saved = Prefs.GetString("tree", null);
            if (saved == null) return null;
            Android.Net.Uri uri = Android.Net.Uri.Parse(saved)!;
            bool granted = context.ContentResolver!.PersistedUriPermissions.Any(p => p.Uri!.Equals(uri) && p.IsWritePermission);
            return granted ? uri : null;
        }
    }

    /// <summary>ready, wrong_signature, outdated ou not_installed, os mesmos estados do BL Editor.</summary>
    public string Status()
    {
        PackageManager manager = context.PackageManager!;
        try
        {
#pragma warning disable CA1422, CS0618
            manager.GetPackageInfo(Package, (PackageInfoFlags)0);
#pragma warning restore CA1422, CS0618
        }
        catch (PackageManager.NameNotFoundException)
        {
            return "not_installed";
        }
        if (ConnectIntent().ResolveActivity(manager) == null) return "outdated";
        return manager.CheckSignatures(context.PackageName!, Package) == SignatureResult.Match ? "ready" : "wrong_signature";
    }

    public string StatusJson() => JsonSerializer.Serialize(new Dictionary<string, object> { ["status"] = Status(), ["connected"] = Tree != null });

    private Intent ConnectIntent()
    {
        var intent = new Intent(ConnectAction);
        intent.SetComponent(new ComponentName(Package, BridgeActivity));
        return intent;
    }

    /// <summary>Com a ponte, ela entrega a pasta; sem ela, abre o seletor do Android na pasta ModSources.</summary>
    public Intent PickIntent()
    {
        if (Status() == "ready") return ConnectIntent();
        var intent = new Intent(Intent.ActionOpenDocumentTree);
        intent.AddFlags(ActivityFlags.GrantReadUriPermission | ActivityFlags.GrantWriteUriPermission | ActivityFlags.GrantPersistableUriPermission);
        intent.PutExtra(DocumentsContract.ExtraInitialUri, DocumentsContract.BuildDocumentUri(DocumentsAuthority, RootId));
        return intent;
    }

    /// <summary>Guarda a pasta so se for mesmo a ModSources do Bunny.</summary>
    public bool Accept(Android.Net.Uri? uri)
    {
        if (uri == null || uri.Authority != DocumentsAuthority || !DocumentsContract.IsTreeUri(uri)) return false;
        if (DocumentsContract.GetTreeDocumentId(uri) != RootId) return false;
        context.ContentResolver!.TakePersistableUriPermission(uri, ActivityFlags.GrantReadUriPermission | ActivityFlags.GrantWriteUriPermission);
        Prefs.Edit()!.PutString("tree", uri.ToString())!.Apply();
        return true;
    }

    public void Enqueue(int id, string op, string json) => jobs.Add((id, op, json));

    private void Loop()
    {
        foreach (var job in jobs.GetConsumingEnumerable())
        {
            string result;
            try
            {
                using JsonDocument args = JsonDocument.Parse(string.IsNullOrEmpty(job.Json) ? "{}" : job.Json);
                result = job.Op switch
                {
                    "list" => List(),
                    "read" => Read(args.RootElement.GetProperty("name").GetString()!),
                    "write" => Write(args.RootElement.GetProperty("name").GetString()!, args.RootElement.GetProperty("files")),
                    "install" => Install(args.RootElement.GetProperty("name").GetString()!),
                    _ => throw new ArgumentException(job.Op),
                };
            }
            catch (Exception error)
            {
                result = JsonSerializer.Serialize(new Dictionary<string, object> { ["ok"] = false, ["error"] = error.Message });
            }
            done(job.Id, result);
        }
    }

    private readonly record struct Entry(string Id, string Name, bool Directory);

    private Android.Net.Uri RequireTree() => Tree ?? throw new InvalidOperationException("not_connected");

    private List<Entry> Children(Android.Net.Uri tree, string documentId)
    {
        var entries = new List<Entry>();
        string[] columns = { DocumentsContract.Document.ColumnDocumentId, DocumentsContract.Document.ColumnDisplayName, DocumentsContract.Document.ColumnMimeType };
        using ICursor? cursor = context.ContentResolver!.Query(DocumentsContract.BuildChildDocumentsUriUsingTree(tree, documentId)!, columns, null, null, null);
        while (cursor != null && cursor.MoveToNext())
            entries.Add(new Entry(cursor.GetString(0)!, cursor.GetString(1)!, cursor.GetString(2) == DocumentsContract.Document.MimeTypeDir));
        return entries;
    }

    private string List()
    {
        Android.Net.Uri tree = RequireTree();
        string[] names = Children(tree, DocumentsContract.GetTreeDocumentId(tree)!).Where(e => e.Directory).Select(e => e.Name).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToArray();
        return JsonSerializer.Serialize(new Dictionary<string, object> { ["ok"] = true, ["projects"] = names });
    }

    private static bool IsText(string name) => TextExtensions.Contains(Path.GetExtension(name).ToLowerInvariant());

    private string Read(string name)
    {
        Android.Net.Uri tree = RequireTree();
        Entry project = Children(tree, DocumentsContract.GetTreeDocumentId(tree)!).FirstOrDefault(e => e.Directory && e.Name == name);
        if (project.Id == null) throw new FileNotFoundException(name);
        var files = new Dictionary<string, Dictionary<string, string>>();
        void Walk(string id, string prefix)
        {
            foreach (Entry entry in Children(tree, id))
            {
                if (entry.Directory)
                {
                    if (!Ignored.Contains(entry.Name, StringComparer.OrdinalIgnoreCase)) Walk(entry.Id, prefix + entry.Name + "/");
                    continue;
                }
                using Stream? input = context.ContentResolver!.OpenInputStream(DocumentsContract.BuildDocumentUriUsingTree(tree, entry.Id)!);
                using var buffer = new MemoryStream();
                input!.CopyTo(buffer);
                byte[] bytes = buffer.ToArray();
                files[prefix + entry.Name] = IsText(entry.Name)
                    ? new Dictionary<string, string> { ["t"] = new UTF8Encoding(false).GetString(bytes) }
                    : new Dictionary<string, string> { ["b"] = Convert.ToBase64String(bytes) };
            }
        }
        Walk(project.Id, "");
        return JsonSerializer.Serialize(new Dictionary<string, object> { ["ok"] = true, ["files"] = files });
    }

    private string Ensure(Android.Net.Uri tree, string parent, string name, bool directory, List<Entry> known)
    {
        Entry found = known.FirstOrDefault(e => e.Name == name && e.Directory == directory);
        if (found.Id != null) return found.Id;
        Android.Net.Uri created = DocumentsContract.CreateDocument(context.ContentResolver!, DocumentsContract.BuildDocumentUriUsingTree(tree, parent)!,
            directory ? DocumentsContract.Document.MimeTypeDir : "application/octet-stream", name) ?? throw new IOException("Nao foi possivel criar " + name);
        string id = DocumentsContract.GetDocumentId(created)!;
        known.Add(new Entry(id, name, directory));
        return id;
    }

    /// <summary>Deixa a pasta do projeto igual ao mod. A pasta bin fica: e o cache de compilacao do Bunny.</summary>
    private string Write(string name, JsonElement files)
    {
        if (name != Path.GetFileName(name) || name.StartsWith('.')) throw new ArgumentException(name);
        Android.Net.Uri tree = RequireTree();
        string root = DocumentsContract.GetTreeDocumentId(tree)!;
        string projectId = Ensure(tree, root, name, true, Children(tree, root));
        var listing = new Dictionary<string, List<Entry>>();
        List<Entry> In(string id) => listing.TryGetValue(id, out List<Entry>? list) ? list : listing[id] = Children(tree, id);
        var kept = new HashSet<string>(StringComparer.Ordinal);
        int count = 0;
        foreach (JsonProperty file in files.EnumerateObject())
        {
            string[] parts = file.Name.Split('/');
            if (parts.Any(p => p.Length == 0 || p == "." || p == "..")) throw new ArgumentException(file.Name);
            string parent = projectId;
            foreach (string part in parts[..^1])
            {
                parent = Ensure(tree, parent, part, true, In(parent));
                kept.Add(parent);
            }
            string id = Ensure(tree, parent, parts[^1], false, In(parent));
            kept.Add(id);
            byte[] bytes = file.Value.TryGetProperty("b", out JsonElement binary)
                ? Convert.FromBase64String(binary.GetString()!)
                : new UTF8Encoding(false).GetBytes(file.Value.GetProperty("t").GetString()!);
            using Stream? output = context.ContentResolver!.OpenOutputStream(DocumentsContract.BuildDocumentUriUsingTree(tree, id)!, "wt");
            output!.Write(bytes, 0, bytes.Length);
            count++;
        }
        void Clean(string id)
        {
            foreach (Entry entry in In(id).ToList())
            {
                if (entry.Directory && Ignored.Contains(entry.Name, StringComparer.OrdinalIgnoreCase)) continue;
                if (!kept.Contains(entry.Id))
                {
                    DocumentsContract.DeleteDocument(context.ContentResolver!, DocumentsContract.BuildDocumentUriUsingTree(tree, entry.Id)!);
                    continue;
                }
                if (entry.Directory) Clean(entry.Id);
            }
        }
        Clean(projectId);
        return JsonSerializer.Serialize(new Dictionary<string, object> { ["ok"] = true, ["count"] = count });
    }

    private string Install(string name)
    {
        Bundle? reply = context.ContentResolver!.Call(Android.Net.Uri.Parse($"content://{Package}.editorbridge")!, "install", name, null);
        if (reply == null) throw new InvalidOperationException("O Bunny nao respondeu.");
        bool ok = reply.GetBoolean("ok");
        return JsonSerializer.Serialize(new Dictionary<string, object> { ["ok"] = ok, ["error"] = reply.GetString("error") ?? "" });
    }
}
