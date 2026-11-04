// C# comum: valem em qualquer mod e seguem o contexto do cursor.
const CSHARP_SNIPPETS = [
  { group: "C#", prefix: "cclass", where: "top", keys: "classe class", title: "Classe", desc: "Classe simples. Depois de : escolha a base do SDK.", body: `public sealed class «1:MinhaClasse»
{
    «0»
}` },
  { group: "C#", prefix: "cstatic", where: "top", using: "System", keys: "classe estatica static helper utilitario", title: "Classe de utilidades", desc: "Classe estática com um método auxiliar.", body: `public static class «1:Utilidades»
{
    public static int «2:Limitar»(int valor) => Math.Clamp(valor, «3:0», «4:100»);
}` },
  { group: "C#", prefix: "cstruct", where: "top", keys: "struct estrutura", title: "Struct", desc: "Tipo de valor com dois campos.", body: `public struct «1:MeusDados»
{
    public int «2:Valor»;
    public float «3:Escala»;
}` },
  { group: "C#", prefix: "cenum", where: "top", keys: "enum enumeracao lista", title: "Enum", desc: "Conjunto de valores com nome.", body: `public enum «1:MeuTipo»
{
    «2:Primeiro»,
    «3:Segundo»
}` },
  { group: "C#", prefix: "cinterface", where: "top", keys: "interface contrato", title: "Interface", desc: "Contrato com um método.", body: `public interface «1:IMinhaInterface»
{
    «2:int» «3:Calcular»();
}` },
  { group: "C#", prefix: "cprop", where: "member", keys: "propriedade prop property", title: "Propriedade", desc: "Propriedade automática.", body: `public «1:int» «2:Valor» { get; set; }` },
  { group: "C#", prefix: "cfield", where: "member", keys: "campo field variavel", title: "Campo", desc: "Campo privado da classe.", body: `private «1:int» «2:valor»;` },
  { group: "C#", prefix: "cconst", where: "member", keys: "constante const", title: "Constante", desc: "Valor fixo da classe.", body: `private const «1:int» «2:Limite» = «3:100»;` },
  { group: "C#", prefix: "cmethod", where: "member", keys: "metodo method funcao", title: "Método", desc: "Método da classe.", body: `public void «1:Executar»(«2»)
{
    «0»
}` },
  { group: "C#", prefix: "cfunc", where: "member", keys: "funcao retorno calcular metodo", title: "Método com retorno", desc: "Calcula e devolve um valor.", body: `private static «1:int» «2:Calcular»(«3:int valor»)
{
    return «4:valor»;
}` },
  { group: "C#", prefix: "cctor", where: "member", keys: "construtor ctor constructor", title: "Construtor", desc: "Construtor da classe atual.", body: `public «CLASS»()
{
    «0»
}` },
  { group: "C#", prefix: "cif", where: "code", keys: "if se condicao", title: "if", desc: "Executa quando a condição é verdadeira.", body: `if («1:true»)
{
    «0»
}` },
  { group: "C#", prefix: "cifelse", where: "code", keys: "else senao ifelse", title: "if / else", desc: "Dois caminhos conforme a condição.", body: `if («1:true»)
{
    «2»
}
else
{
    «0»
}` },
  { group: "C#", prefix: "cfor", where: "code", keys: "for laco repetir loop", title: "for", desc: "Repete um número de vezes.", body: `for (int «1:i» = 0; «1» < «2:10»; «1»++)
{
    «0»
}` },
  { group: "C#", prefix: "cforeach", where: "code", keys: "foreach cada percorrer", title: "foreach", desc: "Percorre uma coleção.", body: `foreach (var «1:item» in new[] { «2:1, 2, 3» })
{
    «0»
}` },
  { group: "C#", prefix: "cwhile", where: "code", keys: "while enquanto", title: "while", desc: "Repete enquanto a condição valer. Evite laços sem fim no jogo.", body: `int «1:n» = 0;
while («1» < «2:10»)
{
    «1»++;
}` },
  { group: "C#", prefix: "cswitch", where: "code", keys: "switch caso escolher", title: "switch", desc: "Escolhe um caminho pelo valor.", body: `switch («1:0»)
{
    case «2:0»:
        «0»
        break;
    default:
        break;
}` },
  { group: "C#", prefix: "ctry", where: "code", using: "System", keys: "try catch erro excecao", title: "try / catch", desc: "Trata uma exceção.", body: `try
{
    «0»
}
catch (Exception «1:erro»)
{
    Console.WriteLine(«1».Message);
}` },
  { group: "C#", prefix: "clist", where: "code", using: "System.Collections.Generic", keys: "lista list colecao", title: "Lista", desc: "Lista com o using certo.", body: `var «1:lista» = new List<«2:int»>();` },
  { group: "C#", prefix: "cdict", where: "code", using: "System.Collections.Generic", keys: "dicionario dictionary mapa", title: "Dicionário", desc: "Dicionário com o using certo.", body: `var «1:mapa» = new Dictionary<«2:string», «3:int»>();` },
  { group: "C#", prefix: "cclamp", where: "code", using: "System", keys: "clamp limitar math", title: "Limitar valor", desc: "Mantém um número entre dois limites.", body: `int «1:valor» = Math.Clamp(«2:50», «3:0», «4:100»);` },
];
