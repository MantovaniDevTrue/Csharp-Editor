using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Resources;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.CodeAnalysis.CSharp;

// Gera { "CS1002": { "e": "; expected", "p": "; esperado" }, ... } para o app traduzir os erros.
Assembly roslyn = typeof(CSharpCompilation).Assembly;
Type codes = roslyn.GetType("Microsoft.CodeAnalysis.CSharp.ErrorCode", throwOnError: true)!;
var resources = new ResourceManager("Microsoft.CodeAnalysis.CSharp.CSharpResources", roslyn);
ResourceSet english = resources.GetResourceSet(CultureInfo.InvariantCulture, true, false)!;
ResourceSet portuguese = resources.GetResourceSet(new CultureInfo("pt-BR"), true, false)
    ?? throw new InvalidOperationException("Traducao pt-BR do Roslyn nao encontrada");
var table = new SortedDictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
foreach (string name in Enum.GetNames(codes))
{
    int number = (int)Convert.ChangeType(Enum.Parse(codes, name), typeof(int), CultureInfo.InvariantCulture);
    string? en = english.GetString(name);
    string? pt = portuguese.GetString(name);
    if (number <= 0 || en == null || pt == null || pt == en) continue;
    table["CS" + number.ToString("D4", CultureInfo.InvariantCulture)] = new Dictionary<string, string> { ["e"] = en, ["p"] = pt };
}
if (table.Count < 1000) throw new InvalidOperationException("Poucas traducoes: " + table.Count);
File.WriteAllText(args[0], JsonSerializer.Serialize(table, new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
Console.WriteLine($"ROSLYN_PT mensagens={table.Count}");
