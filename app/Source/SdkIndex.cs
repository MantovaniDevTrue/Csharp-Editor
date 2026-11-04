using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;

namespace BunnyStudio;

/// <summary>Le os tipos publicos do BunnyLoader.dll para o autocomplete, sem carregar a DLL.</summary>
public static class SdkIndex
{
    private static readonly string[] Namespaces = { "Terraria", "Microsoft.Xna", "ReLogic" };

    public static void Write(string dll, string target)
    {
        using FileStream stream = File.OpenRead(dll);
        using var pe = new PEReader(stream);
        MetadataReader reader = pe.GetMetadataReader();
        var names = new Names();
        string temporary = target + ".tmp";
        var seen = new HashSet<string>(StringComparer.Ordinal);
        using (FileStream file = File.Create(temporary))
        using (var json = new Utf8JsonWriter(file))
        {
            json.WriteStartObject();
            json.WritePropertyName("types");
            json.WriteStartObject();
            foreach (TypeDefinitionHandle handle in reader.TypeDefinitions)
            {
                TypeDefinition type = reader.GetTypeDefinition(handle);
                if (!IsVisible(reader, type)) continue;
                string ns = NamespaceOf(reader, type);
                if (!Namespaces.Any(p => ns == p || ns.StartsWith(p + ".", StringComparison.Ordinal))) continue;
                string name = Clean(reader.GetString(type.Name));
                if (name.Contains('<') || !seen.Add(name)) continue;
                WriteType(json, reader, names, type, name, ns);
            }
            json.WriteEndObject();
            json.WriteEndObject();
        }
        File.Move(temporary, target, true);
    }

    private static bool IsVisible(MetadataReader reader, TypeDefinition type)
    {
        TypeAttributes visibility = type.Attributes & TypeAttributes.VisibilityMask;
        if (visibility == TypeAttributes.Public) return true;
        if (visibility != TypeAttributes.NestedPublic) return false;
        return IsVisible(reader, reader.GetTypeDefinition(type.GetDeclaringType()));
    }

    private static string NamespaceOf(MetadataReader reader, TypeDefinition type)
    {
        while (!type.GetDeclaringType().IsNil) type = reader.GetTypeDefinition(type.GetDeclaringType());
        return reader.GetString(type.Namespace);
    }

    private static string Clean(string name)
    {
        int tick = name.IndexOf('`');
        return tick < 0 ? name : name[..tick];
    }

    private static string BaseOf(MetadataReader reader, Names names, TypeDefinition type)
    {
        EntityHandle handle = type.BaseType;
        if (handle.IsNil) return "";
        string text = handle.Kind switch
        {
            HandleKind.TypeDefinition => names.GetTypeFromDefinition(reader, (TypeDefinitionHandle)handle, 0),
            HandleKind.TypeReference => names.GetTypeFromReference(reader, (TypeReferenceHandle)handle, 0),
            HandleKind.TypeSpecification => names.GetTypeFromSpecification(reader, null, (TypeSpecificationHandle)handle, 0),
            _ => "",
        };
        int generic = text.IndexOf('<');
        return generic < 0 ? text : text[..generic];
    }

    private static void WriteType(Utf8JsonWriter json, MetadataReader reader, Names names, TypeDefinition type, string name, string ns)
    {
        string baseName = BaseOf(reader, names, type);
        string kind = (type.Attributes & TypeAttributes.Interface) != 0 ? "interface"
            : baseName == "Enum" ? "enum" : baseName == "ValueType" ? "struct" : "class";
        json.WritePropertyName(name);
        json.WriteStartObject();
        json.WriteString("ns", ns);
        json.WriteString("kind", kind);
        if (kind == "class" && baseName is not ("" or "Object")) json.WriteString("base", baseName);
        if ((type.Attributes & TypeAttributes.Abstract) != 0 && kind == "class" && (type.Attributes & TypeAttributes.Sealed) == 0)
            json.WriteNumber("abstract", 1);
        json.WritePropertyName("members");
        json.WriteStartArray();
        foreach (FieldDefinitionHandle handle in type.GetFields()) WriteField(json, reader, names, reader.GetFieldDefinition(handle), kind == "enum");
        foreach (PropertyDefinitionHandle handle in type.GetProperties()) WriteProperty(json, reader, names, reader.GetPropertyDefinition(handle));
        foreach (EventDefinitionHandle handle in type.GetEvents()) WriteEvent(json, reader, reader.GetEventDefinition(handle));
        foreach (MethodDefinitionHandle handle in type.GetMethods()) WriteMethod(json, reader, names, reader.GetMethodDefinition(handle));
        json.WriteEndArray();
        json.WriteEndObject();
    }

    private static bool Open(MethodAttributes attributes)
    {
        MethodAttributes access = attributes & MethodAttributes.MemberAccessMask;
        return access is MethodAttributes.Public or MethodAttributes.Family or MethodAttributes.FamORAssem;
    }

    private static void WriteField(Utf8JsonWriter json, MetadataReader reader, Names names, FieldDefinition field, bool isEnum)
    {
        FieldAttributes access = field.Attributes & FieldAttributes.FieldAccessMask;
        if (access is not (FieldAttributes.Public or FieldAttributes.Family or FieldAttributes.FamORAssem)) return;
        if ((field.Attributes & FieldAttributes.SpecialName) != 0) return;
        string name = reader.GetString(field.Name);
        if (name.Contains('<')) return;
        bool literal = (field.Attributes & FieldAttributes.Literal) != 0;
        bool constant = (field.Attributes & (FieldAttributes.Literal | FieldAttributes.InitOnly)) != 0;
        json.WriteStartObject();
        json.WriteString("n", name);
        json.WriteString("t", isEnum ? "enum" : field.DecodeSignature(names, null));
        json.WriteString("k", isEnum ? "e" : literal ? "c" : "p");
        if ((field.Attributes & FieldAttributes.Static) != 0) json.WriteNumber("s", 1);
        if (!constant) json.WriteNumber("w", 1);
        json.WriteEndObject();
    }

    private static void WriteProperty(Utf8JsonWriter json, MetadataReader reader, Names names, PropertyDefinition property)
    {
        PropertyAccessors accessors = property.GetAccessors();
        MethodDefinition? getter = accessors.Getter.IsNil ? null : reader.GetMethodDefinition(accessors.Getter);
        MethodDefinition? setter = accessors.Setter.IsNil ? null : reader.GetMethodDefinition(accessors.Setter);
        MethodAttributes? main = getter?.Attributes ?? setter?.Attributes;
        bool readable = getter != null && Open(getter.Value.Attributes);
        bool writable = setter != null && Open(setter.Value.Attributes);
        if (main == null || !(readable || writable)) return;
        MethodSignature<string> signature = property.DecodeSignature(names, null);
        if (signature.ParameterTypes.Length > 0) return; // indexador
        string name = reader.GetString(property.Name);
        if (name.Contains('.')) return;
        json.WriteStartObject();
        json.WriteString("n", name);
        json.WriteString("t", signature.ReturnType.StartsWith("ref ", StringComparison.Ordinal) ? signature.ReturnType[4..] : signature.ReturnType);
        json.WriteString("k", "p");
        if (writable) json.WriteNumber("w", 1);
        WriteFlags(json, main.Value);
        json.WriteEndObject();
    }

    private static void WriteEvent(Utf8JsonWriter json, MetadataReader reader, EventDefinition item)
    {
        EventAccessors accessors = item.GetAccessors();
        if (accessors.Adder.IsNil) return;
        MethodAttributes adder = reader.GetMethodDefinition(accessors.Adder).Attributes;
        if (!Open(adder)) return;
        json.WriteStartObject();
        json.WriteString("n", reader.GetString(item.Name));
        json.WriteString("t", "event");
        json.WriteString("k", "p");
        json.WriteNumber("w", 1);
        if ((adder & MethodAttributes.Static) != 0) json.WriteNumber("s", 1);
        json.WriteEndObject();
    }

    private static void WriteMethod(Utf8JsonWriter json, MetadataReader reader, Names names, MethodDefinition method)
    {
        if (!Open(method.Attributes) || (method.Attributes & MethodAttributes.SpecialName) != 0) return;
        string name = reader.GetString(method.Name);
        if (name.Contains('<') || name.Contains('.')) return;
        MethodSignature<string> signature = method.DecodeSignature(names, null);
        var parameters = new string[signature.ParameterTypes.Length];
        for (int i = 0; i < parameters.Length; i++) parameters[i] = signature.ParameterTypes[i] + " arg" + (i + 1);
        foreach (ParameterHandle handle in method.GetParameters())
        {
            Parameter parameter = reader.GetParameter(handle);
            int index = parameter.SequenceNumber - 1;
            if (index < 0 || index >= parameters.Length) continue;
            string text = signature.ParameterTypes[index];
            if ((parameter.Attributes & ParameterAttributes.Out) != 0 && text.StartsWith("ref ", StringComparison.Ordinal))
                text = "out " + text[4..];
            text += " " + reader.GetString(parameter.Name);
            if ((parameter.Attributes & ParameterAttributes.Optional) != 0) text += " = default";
            parameters[index] = text;
        }
        json.WriteStartObject();
        json.WriteString("n", name);
        json.WriteString("t", signature.ReturnType);
        json.WriteString("k", "m");
        json.WriteString("p", string.Join(", ", parameters));
        WriteFlags(json, method.Attributes);
        json.WriteEndObject();
    }

    private static void WriteFlags(Utf8JsonWriter json, MethodAttributes attributes)
    {
        if ((attributes & MethodAttributes.Static) != 0) json.WriteNumber("s", 1);
        if ((attributes & MethodAttributes.Abstract) != 0) json.WriteNumber("a", 1);
        else if ((attributes & MethodAttributes.Virtual) != 0 && (attributes & MethodAttributes.Final) == 0) json.WriteNumber("v", 1);
    }

    private sealed class Names : ISignatureTypeProvider<string, object?>
    {
        public string GetArrayType(string elementType, ArrayShape shape) => elementType + "[" + new string(',', Math.Max(0, shape.Rank - 1)) + "]";
        public string GetByReferenceType(string elementType) => "ref " + elementType;
        public string GetFunctionPointerType(MethodSignature<string> signature) => "nint";
        public string GetGenericInstantiation(string genericType, ImmutableArray<string> typeArguments) => genericType + "<" + string.Join(", ", typeArguments) + ">";
        public string GetGenericMethodParameter(object? genericContext, int index) => "T" + (index == 0 ? "" : index.ToString());
        public string GetGenericTypeParameter(object? genericContext, int index) => "T" + (index == 0 ? "" : index.ToString());
        public string GetModifiedType(string modifier, string unmodifiedType, bool isRequired) => unmodifiedType;
        public string GetPinnedType(string elementType) => elementType;
        public string GetPointerType(string elementType) => elementType + "*";
        public string GetSZArrayType(string elementType) => elementType + "[]";

        public string GetPrimitiveType(PrimitiveTypeCode typeCode) => typeCode switch
        {
            PrimitiveTypeCode.Boolean => "bool", PrimitiveTypeCode.Byte => "byte", PrimitiveTypeCode.SByte => "sbyte",
            PrimitiveTypeCode.Char => "char", PrimitiveTypeCode.Int16 => "short", PrimitiveTypeCode.UInt16 => "ushort",
            PrimitiveTypeCode.Int32 => "int", PrimitiveTypeCode.UInt32 => "uint", PrimitiveTypeCode.Int64 => "long",
            PrimitiveTypeCode.UInt64 => "ulong", PrimitiveTypeCode.Single => "float", PrimitiveTypeCode.Double => "double",
            PrimitiveTypeCode.String => "string", PrimitiveTypeCode.Object => "object", PrimitiveTypeCode.Void => "void",
            PrimitiveTypeCode.IntPtr => "nint", PrimitiveTypeCode.UIntPtr => "nuint",
            _ => "object",
        };

        public string GetTypeFromDefinition(MetadataReader reader, TypeDefinitionHandle handle, byte rawTypeKind) =>
            Clean(reader.GetString(reader.GetTypeDefinition(handle).Name));

        public string GetTypeFromReference(MetadataReader reader, TypeReferenceHandle handle, byte rawTypeKind) =>
            Clean(reader.GetString(reader.GetTypeReference(handle).Name));

        public string GetTypeFromSpecification(MetadataReader reader, object? genericContext, TypeSpecificationHandle handle, byte rawTypeKind) =>
            reader.GetTypeSpecification(handle).DecodeSignature(this, genericContext);
    }
}
