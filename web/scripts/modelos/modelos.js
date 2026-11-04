// ---------- Snippets ----------
// «n:padrão» é um ponto de parada do Tab; «n» repete o valor; «NS» é o namespace do mod.
const FILE_SNIPPETS = [
  { group: "Itens", prefix: "bitem", loc: "Items", keys: "item material minerio barra lingote ingot bar ore", title: "Material com receita", desc: "Item empilhável, feito na bancada.", folder: "Content/Items", cls: "MeuMaterial", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuMaterial» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 20;
        Item.height = 20;
        Item.maxStack = Item.CommonMaxStack;
        Item.value = Item.buyPrice(silver: «2:1»);
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.DirtBlock, «3:10»)
            .AddTile(TileID.WorkBenches)
            .Register();
    }
}
` },
  { group: "Itens", prefix: "bsword", loc: "Items", keys: "espada sword lamina corpo melee arma", title: "Espada corpo a corpo", desc: "Golpe do Terraria, com fogo ao acertar e receita.", folder: "Content/Items/Weapons", cls: "MinhaEspada", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MinhaEspada» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 40;
        Item.height = 40;

        Item.useStyle = ItemUseStyleID.Swing;
        Item.useTime = «2:20»;
        Item.useAnimation = «2»;
        Item.autoReuse = true;

        Item.DamageType = DamageClass.Melee;
        Item.damage = «3:50»;
        Item.knockBack = 6;
        Item.crit = 6;

        Item.value = Item.buyPrice(gold: 1);
        Item.rare = ItemRarityID.Orange;
        Item.UseSound = SoundID.Item1;
    }

    public override void OnHitNPC(Player player, NPC target, NPC.HitInfo hit, int damageDone)
    {
        target.AddBuff(BuffID.OnFire, «4:60»);
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.DirtBlock, 10)
            .AddTile(TileID.WorkBenches)
            .Register();
    }
}
` },
  { group: "Itens", prefix: "bgun", loc: "Items", keys: "arma tiro projetil varinha cajado arco pistola gun wand staff bow", title: "Arma que atira", desc: "Dispara um projétil seu. Crie também o modelo de projétil.", folder: "Content/Items/Weapons", cls: "MinhaArma", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MinhaArma» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 40;
        Item.height = 40;

        Item.useStyle = ItemUseStyleID.Shoot;
        Item.useTime = «2:20»;
        Item.useAnimation = «2»;
        Item.autoReuse = true;
        Item.noMelee = true;

        Item.DamageType = DamageClass.«3:Ranged»;
        Item.damage = «4:30»;
        Item.knockBack = 4;
        Item.UseSound = SoundID.Item11;

        Item.shoot = ProjectileID.«5:WoodenArrowFriendly»;
        Item.shootSpeed = «6:10»f;
    }
}
` },
  { group: "Itens", prefix: "btool", loc: "Items", keys: "ferramenta picareta machado martelo pickaxe axe hammer hamaxe", title: "Picareta", desc: "Ferramenta de mineração.", folder: "Content/Items/Tools", cls: "MinhaPicareta", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MinhaPicareta» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 40;
        Item.height = 40;

        Item.useStyle = ItemUseStyleID.Swing;
        Item.useTime = 15;
        Item.useAnimation = 15;
        Item.autoReuse = true;
        Item.useTurn = true;

        Item.DamageType = DamageClass.Melee;
        Item.damage = «2:15»;
        Item.knockBack = 3;
        Item.pick = «3:60»;
        Item.UseSound = SoundID.Item1;
    }
}
` },
  { group: "Itens", prefix: "bacc", loc: "Items", keys: "acessorio accessory anel escudo ring shield", title: "Acessório", desc: "Dá defesa e dano enquanto estiver equipado.", folder: "Content/Items/Accessories", cls: "MeuAcessorio", texture: true, body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuAcessorio» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 24;
        Item.height = 28;
        Item.value = Item.buyPrice(gold: 1);
        Item.rare = 2;
        Item.accessory = true;
        Item.defense = «2:4»;
    }

    public override void UpdateAccessory(Player player, bool hideVisual)
    {
        player.GetDamage(DamageClass.Generic) += «3:10» / 100f;
    }
}
` },
  { group: "Itens", prefix: "barmor", loc: "Items", keys: "armadura capacete helmet armor elmo", title: "Capacete de armadura", desc: "Usa a textura de item e a Nome_Head.png.", folder: "Content/Items/Armor", cls: "MeuCapacete", texture: true, body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

[AutoloadEquip(EquipType.Head)]
public class «1:MeuCapacete» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 18;
        Item.height = 18;
        Item.value = Item.sellPrice(gold: 1);
        Item.rare = 2;
        Item.defense = «2:5»;
    }
}
` },
  { group: "Itens", prefix: "bpotion", loc: "Items", keys: "pocao potion consumivel buff", title: "Poção de buff", desc: "Consumível que aplica um buff.", folder: "Content/Items/Consumables", cls: "MinhaPocao", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MinhaPocao» : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 20;
        Item.height = 26;
        Item.useStyle = ItemUseStyleID.DrinkLiquid;
        Item.useAnimation = 15;
        Item.useTime = 15;
        Item.useTurn = true;
        Item.UseSound = SoundID.Item3;
        Item.maxStack = Item.CommonMaxStack;
        Item.consumable = true;
        Item.buffType = BuffID.«2:Ironskin»;
        Item.buffTime = «3:3600»;
    }
}
` },
  { group: "Combate", prefix: "bproj", loc: "Projectiles", keys: "projetil projectile tiro bala flecha", title: "Projétil", desc: "Voa como uma flecha, atravessa e some.", folder: "Content/Projectiles", cls: "MeuProjetil", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuProjetil» : ModProjectile
{
    public override void SetDefaults()
    {
        Projectile.width = 8;
        Projectile.height = 8;
        Projectile.aiStyle = ProjAIStyleID.Arrow;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.DamageType = DamageClass.Ranged;
        Projectile.penetrate = «2:3»;
        Projectile.timeLeft = «3:600»;
    }
}
` },
  { group: "Combate", prefix: "bbuff", loc: "Buffs", keys: "buff efeito debuff", title: "Buff", desc: "Efeito no jogador enquanto estiver ativo.", folder: "Content/Buffs", cls: "MeuBuff", texture: true, body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuBuff» : ModBuff
{
    public override void Update(Player player, ref int buffIndex)
    {
        player.statDefense += «2:10»;
    }
}
` },
  { group: "Combate", prefix: "bnpc", loc: "NPCs", keys: "npc inimigo enemy monstro", title: "NPC inimigo", desc: "Inimigo com a IA de slime.", folder: "Content/NPCs", cls: "MeuInimigo", texture: true, body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuInimigo» : ModNPC
{
    public override void SetDefaults()
    {
        NPC.width = 36;
        NPC.height = 36;
        NPC.aiStyle = «2:1»;
        NPC.damage = «3:7»;
        NPC.defense = 2;
        NPC.lifeMax = «4:25»;
        NPC.HitSound = SoundID.NPCHit1;
        NPC.DeathSound = SoundID.NPCDeath1;
        NPC.value = 25f;
    }
}
` },
  { group: "Mundo", prefix: "btile", loc: "Tiles", keys: "bloco tile block colocavel", title: "Bloco", desc: "Bloco sólido. Crie um item que coloque este bloco.", folder: "Content/Tiles", cls: "MeuBloco", texture: true, body: `using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuBloco» : ModTile
{
    public override void SetStaticDefaults()
    {
        Main.tileSolid[Type] = true;
        Main.tileMergeDirt[Type] = true;
        Main.tileBlockLight[Type] = true;
        AddMapEntry(new Color(«2:200», «3:200», «4:200»));
    }
}
` },
  { group: "Mundo", prefix: "bwall", loc: "Walls", keys: "parede wall", title: "Parede", desc: "Parede que conta como casa.", folder: "Content/Walls", cls: "MinhaParede", texture: true, body: `using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MinhaParede» : ModWall
{
    public override void SetStaticDefaults()
    {
        Main.wallHouse[Type] = true;
        AddMapEntry(new Color(«2:150», «3:150», «4:150»));
    }
}
` },
  { group: "Sistemas", prefix: "bplayer", keys: "jogador player modplayer", title: "ModPlayer", desc: "Código que roda em cada jogador.", folder: "Common/Players", cls: "MeuJogador", body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuJogador» : ModPlayer
{
    public override void PostUpdate()
    {
        «0»
    }
}
` },
  { group: "Sistemas", prefix: "bglobalitem", keys: "global item todos itens globalitem vanilla", title: "GlobalItem", desc: "Muda todos os itens do jogo. Aqui, dobra o dano.", folder: "Common/GlobalItems", cls: "MeuItemGlobal", body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuItemGlobal» : GlobalItem
{
    public override void SetDefaults(Item item)
    {
        if (item.damage > 0) item.damage *= «2:2»;
    }
}
` },
  { group: "Sistemas", prefix: "bglobalnpc", keys: "global npc todos inimigos globalnpc", title: "GlobalNPC", desc: "Muda todos os NPCs do jogo. Aqui, a vida.", folder: "Common/GlobalNPCs", cls: "MeuNpcGlobal", body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuNpcGlobal» : GlobalNPC
{
    public override void SetDefaults(NPC npc)
    {
        npc.lifeMax *= «2:2»;
    }
}
` },
  { group: "Sistemas", prefix: "bsystem", keys: "sistema system modsystem mundo receitas", title: "ModSystem", desc: "Código ligado ao mundo e às receitas.", folder: "Common/Systems", cls: "MeuSistema", body: `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MeuSistema» : ModSystem
{
    public override void AddRecipes()
    {
        Recipe.Create(ItemID.«2:Wood»)
            .AddIngredient(ItemID.«3:DirtBlock», «4:1»)
            .Register();
    }
}
` },
];
