using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using Android.Content;
using Android.Content.PM;
using BunnyLoader.Compiler;

namespace BunnyStudio;

public sealed record BunnyInstall(string Package, string Version, long Updated, string Apk);

/// <summary>
/// As referencias dos mods vem do Bunny instalado: assim o app compila contra a mesma API que
/// vai rodar o mod, e nao precisa levar uma copia dela no APK.
/// </summary>
public static class BunnyPackage
{
    public static readonly string[] Packages = { "com.bunnyloader", "com.bunnyloader.beta", "com.bunnyloader.bench" };
    /// <summary>Pede ao Bunny para instalar e ativar um pacote, com a confirmacao dele.</summary>
    public const string ImportAction = "dev.bunnyloader.action.IMPORT_PACKAGE";
    private const string AssetFolder = "assets/dotnet/";
    private const string ApiFile = "BunnyLoader.dll";
    private static readonly object Gate = new();

    public static BunnyInstall? Find(Context context)
    {
        foreach (string package in Packages)
        {
            try
            {
#pragma warning disable CA1422, CS0618
                PackageInfo info = context.PackageManager!.GetPackageInfo(package, (PackageInfoFlags)0)!;
#pragma warning restore CA1422, CS0618
                string? apk = info.ApplicationInfo?.SourceDir;
                if (apk != null) return new BunnyInstall(package, info.VersionName ?? "", info.LastUpdateTime, apk);
            }
            catch (PackageManager.NameNotFoundException)
            {
            }
        }
        return null;
    }

    /// <summary>Pasta com references.txt e as DLLs, ou null se o Bunny faltar ou nao tiver a API C#.</summary>
    public static string? ReferenceFolder(Context context)
    {
        string? test = TestFolder(context);
        if (test != null) return test;
        BunnyInstall? install = Find(context);
        if (install == null) return null;
        lock (Gate)
        {
            string root = Path.Combine(context.FilesDir!.AbsolutePath, "bunny-references");
            string folder = Path.Combine(root, $"{install.Package}-{install.Updated}");
            string stamp = Path.Combine(folder, ".pronto");
            if (File.Exists(stamp)) return folder;
            if (Directory.Exists(root)) Directory.Delete(root, true);
            Directory.CreateDirectory(folder);
            using ZipArchive apk = ZipFile.OpenRead(install.Apk);
            ZipArchiveEntry? list = apk.GetEntry(AssetFolder + ModBuild.ReferencesFile);
            if (list == null || apk.GetEntry(AssetFolder + ApiFile) == null) return null;
            list.ExtractToFile(Path.Combine(folder, ModBuild.ReferencesFile));
            foreach (string name in File.ReadAllLines(Path.Combine(folder, ModBuild.ReferencesFile)).Select(l => l.Trim()))
            {
                if (name.Length == 0 || name.StartsWith('#')) continue;
                if (name != Path.GetFileName(name)) throw new InvalidDataException("Referencia invalida: " + name);
                ZipArchiveEntry entry = apk.GetEntry(AssetFolder + name) ?? throw new FileNotFoundException(name);
                entry.ExtractToFile(Path.Combine(folder, name));
            }
            File.WriteAllText(stamp, install.Version);
            return folder;
        }
    }

    /// <summary>So existe no APK do emulador: uma API de teste, ja que la nao ha Bunny instalado.</summary>
    public static bool HasTestApi(Context context) => context.Assets!.List("testrefs")!.Length > 0;

    private static string? TestFolder(Context context)
    {
        if (!HasTestApi(context)) return null;
        lock (Gate)
        {
            string folder = Path.Combine(context.FilesDir!.AbsolutePath, "testrefs");
            Directory.CreateDirectory(folder);
            foreach (string name in context.Assets!.List("testrefs")!)
            {
                string target = Path.Combine(folder, name);
                if (File.Exists(target)) continue;
                using Stream source = context.Assets.Open("testrefs/" + name);
                using FileStream output = File.Create(target);
                source.CopyTo(output);
            }
            return folder;
        }
    }

    public static IReadOnlyList<string>? References(Context context)
    {
        string? folder = ReferenceFolder(context);
        return folder == null ? null : ModBuild.References(folder);
    }
}
