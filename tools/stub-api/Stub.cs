namespace Terraria
{
    public class Item
    {
        public const int CommonMaxStack = 9999;
        public int width, height, maxStack, value, damage, rare;
        public float shootSpeed;
        public static int buyPrice(int platinum = 0, int gold = 0, int silver = 0, int copper = 0) => silver * 100;
    }
    public class Player { public int statDefense; }
    public class NPC { public int lifeMax; }
    public class Projectile { public int width, height, penetrate, timeLeft; public bool friendly; }
    public class Recipe
    {
        public Recipe AddIngredient(int type, int stack = 1) => this;
        public Recipe AddTile(int type) => this;
        public Recipe Register() => this;
    }
}
namespace Terraria.ID
{
    public static class ItemID { public const short DirtBlock = 2; }
    public static class TileID { public const ushort WorkBenches = 18; }
}
namespace Terraria.ModLoader
{
    public abstract class Mod { }
    public abstract class ModType { }
    public abstract class ModItem : ModType
    {
        public Item Item { get; } = new Item();
        public virtual void SetDefaults() { }
        public virtual void AddRecipes() { }
        public Recipe CreateRecipe(int amount = 1) => new Recipe();
    }
    public abstract class ModProjectile : ModType
    {
        public Projectile Projectile { get; } = new Projectile();
        public virtual void SetDefaults() { }
    }
    public abstract class ModBuff : ModType
    {
        public virtual void Update(Player player, ref int buffIndex) { }
    }
    public static class ModContent { public static int ItemType<T>() where T : ModItem => 0; }
}
