// ---------- Modelos em JavaScript ----------
// Mesmo formato dos modelos de C#: «1:Nome» é o nome da classe, «0» é onde o cursor para.
const JS_FILE_SNIPPETS = [
  { group: "Itens", prefix: "bitem", loc: "Items", keys: "item material minerio barra lingote ingot bar ore", title: "Material com receita", desc: "Item empilhável, feito na bancada.", folder: "content/Content/Items", cls: "MeuMaterial", texture: true, body: `const { ItemID, TileID } = Terraria.ID;

export class «1:MeuMaterial» extends ModItem {
    SetDefaults() {
        this.Item.width = 20;
        this.Item.height = 20;
        this.Item.maxStack = ModItem.CommonMaxStack;
        this.Item.value = Terraria.Item.buyPrice(0, 0, 10, 0);
        this.Item.rare = ItemRarityID.Blue;«0»
    }

    AddRecipes() {
        this.CreateRecipe()
            .AddIngredient(ItemID.StoneBlock, 10)
            .AddTile(TileID.WorkBenches)
            .Register();
    }
}
` },
  { group: "Itens", prefix: "bsword", loc: "Items", keys: "espada sword lamina corpo melee arma", title: "Espada corpo a corpo", desc: "Golpe do Terraria, com fogo ao acertar e receita.", folder: "content/Content/Items/Weapons", cls: "MinhaEspada", texture: true, body: `const { ItemID, TileID, BuffID, SoundID, ItemUseStyleID } = Terraria.ID;

export class «1:MinhaEspada» extends ModItem {
    SetDefaults() {
        this.Item.width = 40;
        this.Item.height = 40;
        this.Item.DamageType = DamageClass.Melee;
        this.Item.damage = «2:50»;
        this.Item.knockBack = 6;
        this.Item.crit = 6;
        this.Item.useStyle = ItemUseStyleID.Swing;
        this.Item.useTime = 20;
        this.Item.useAnimation = 20;
        this.Item.autoReuse = true;
        this.Item.UseSound = SoundID.Item1;
        this.Item.value = Terraria.Item.sellPrice(0, 1, 0, 0);
        this.Item.rare = ItemRarityID.Green;«0»
    }

    OnHitNPC(item, player, target, hit, damageDone) {
        // 3 segundos de fogo (60 quadros por segundo).
        target.AddBuff(BuffID.OnFire, 180, false);
    }

    AddRecipes() {
        this.CreateRecipe()
            .AddIngredient(ItemID.IronBar, 10)
            .AddTile(TileID.Anvils)
            .Register();
    }
}
` },
  { group: "Itens", prefix: "bgun", loc: "Items", keys: "arma tiro projetil varinha cajado arco pistola gun wand staff bow", title: "Arma que atira", desc: "Dispara um projétil do jogo. Troque pelo seu com ModContent.ProjectileType.", folder: "content/Content/Items/Weapons", cls: "MinhaArma", texture: true, body: `const { ProjectileID, SoundID, ItemUseStyleID } = Terraria.ID;

export class «1:MinhaArma» extends ModItem {
    SetDefaults() {
        this.Item.width = 40;
        this.Item.height = 20;
        this.Item.DamageType = DamageClass.Ranged;
        this.Item.damage = «2:20»;
        this.Item.knockBack = 2;
        this.Item.useStyle = ItemUseStyleID.Shoot;
        this.Item.useTime = 12;
        this.Item.useAnimation = 12;
        this.Item.autoReuse = true;
        this.Item.noMelee = true;
        this.Item.shoot = ProjectileID.WoodenArrowFriendly;
        this.Item.shootSpeed = 10;
        this.Item.UseSound = SoundID.Item5;
        this.Item.value = Terraria.Item.sellPrice(0, 1, 0, 0);
        this.Item.rare = ItemRarityID.Green;«0»
    }
}
` },
  { group: "Itens", prefix: "bacc", loc: "Items", keys: "acessorio accessory anel escudo ring shield", title: "Acessório", desc: "Dá defesa e velocidade enquanto estiver equipado.", folder: "content/Content/Items/Accessories", cls: "MeuAcessorio", texture: true, body: `export class «1:MeuAcessorio» extends ModItem {
    SetDefaults() {
        this.Item.width = 24;
        this.Item.height = 24;
        this.Item.accessory = true;
        this.Item.defense = 4;
        this.Item.value = Terraria.Item.sellPrice(0, 1, 0, 0);
        this.Item.rare = ItemRarityID.Orange;
    }

    UpdateAccessory(item, player, vanity, hideVisual) {
        player.moveSpeed += 0.1;«0»
    }
}
` },
  { group: "Combate", prefix: "bproj", loc: "Projectiles", keys: "projetil projectile tiro bala flecha", title: "Projétil", desc: "Voa reto, atravessa dois inimigos e some.", folder: "content/Content/Projectiles", cls: "MeuProjetil", texture: true, body: `export class «1:MeuProjetil» extends ModProjectile {
    SetDefaults() {
        this.Projectile.width = 16;
        this.Projectile.height = 16;
        this.Projectile.friendly = true;
        this.Projectile.DamageType = DamageClass.Ranged;
        this.Projectile.penetrate = 2;
        this.Projectile.timeLeft = 600;
        this.Projectile.aiStyle = 1;«0»
    }
}
` },
  { group: "Combate", prefix: "bnpc", loc: "NPCs", keys: "npc inimigo enemy monstro slime", title: "NPC inimigo", desc: "Inimigo com a IA e a animação do slime.", folder: "content/Content/NPCs", cls: "MeuInimigo", texture: true, body: `const { NPCID, SoundID } = Terraria.ID;

export class «1:MeuInimigo» extends ModNPC {
    SetStaticDefaults() {
        Terraria.Main.npcFrameCount[this.Type] = 2;
    }

    SetDefaults() {
        this.NPC.width = 32;
        this.NPC.height = 24;
        this.NPC.aiStyle = NPCAIStyleID.Slime;
        this.NPC.lifeMax = «2:40»;
        this.NPC.damage = 10;
        this.NPC.defense = 4;
        this.NPC.knockBackResist = 0.5;
        this.NPC.HitSound = SoundID.NPCHit1;
        this.NPC.DeathSound = SoundID.NPCDeath1;
        this.AIType = NPCID.BlueSlime;
        this.AnimationType = NPCID.BlueSlime;«0»
    }

    SpawnChance(spawnInfo) {
        // Aparece de dia, na superfície.
        return Terraria.Main.dayTime && spawnInfo.Player.ZoneOverworldHeight ? 0.1 : 0;
    }
}
` },
  { group: "Combate", prefix: "bbuff", loc: "Buffs", keys: "buff efeito debuff", title: "Buff", desc: "Efeito no jogador enquanto estiver ativo.", folder: "content/Content/Buffs", cls: "MeuBuff", texture: true, body: `export class «1:MeuBuff» extends ModBuff {
    UpdatePlayer(player, buffIndex) {
        player.statDefense += 8;
        player.moveSpeed += 0.2;«0»
    }
}
` },
  { group: "Mundo", prefix: "btile", loc: "Tiles", keys: "bloco tile block colocavel", title: "Bloco", desc: "Bloco sólido. Crie um item que coloque este bloco.", folder: "content/Content/Tiles", cls: "MeuBloco", texture: true, body: `const { DustID } = Terraria.ID;
const Main = Terraria.Main;

export class «1:MeuBloco» extends ModTile {
    SetStaticDefaults() {
        Main.tileSolid[this.Type] = true;
        Main.tileMergeDirt[this.Type] = true;
        Main.tileBlockLight[this.Type] = true;
        this.DustType = DustID.Stone;
        this.AddMapEntry(Color.new(«2:120», 120, 140));«0»
    }
}
` },
  { group: "Mundo", prefix: "bwall", loc: "Walls", keys: "parede wall", title: "Parede", desc: "Parede que conta como casa.", folder: "content/Content/Walls", cls: "MinhaParede", texture: true, body: `const Main = Terraria.Main;

export class «1:MinhaParede» extends ModWall {
    SetStaticDefaults() {
        Main.wallHouse[this.Type] = true;
        this.AddMapEntry(Color.new(«2:90», 90, 110));«0»
    }
}
` },
  { group: "Sistemas", prefix: "bplayer", keys: "jogador player modplayer", title: "ModPlayer", desc: "Código que roda em cada jogador.", folder: "content/Common/Players", cls: "MeuJogador", body: `export class «1:MeuJogador» extends ModPlayer {
    temBonus = false;

    ResetEffects(player) {
        this.temBonus = false;
    }

    PostUpdateEquips(player) {
        if (this.temBonus) player.statDefense += 5;«0»
    }
}
` },
  { group: "Sistemas", prefix: "bglobalitem", keys: "global item todos itens globalitem vanilla", title: "GlobalItem", desc: "Muda todos os itens do jogo. Aqui, dobra o dano.", folder: "content/Common/GlobalItems", cls: "MeuItemGlobal", body: `export class «1:MeuItemGlobal» extends GlobalItem {
    SetDefaults(item) {
        if (item.damage > 0) item.damage *= 2;«0»
    }
}
` },
  { group: "Sistemas", prefix: "bglobalnpc", keys: "global npc todos inimigos globalnpc", title: "GlobalNPC", desc: "Muda todos os NPCs do jogo. Aqui, a vida.", folder: "content/Common/GlobalNPCs", cls: "MeuNpcGlobal", body: `export class «1:MeuNpcGlobal» extends GlobalNPC {
    SetDefaults(npc) {
        if (!npc.friendly) npc.lifeMax = Math.floor(npc.lifeMax * 1.5);«0»
    }
}
` },
  { group: "Sistemas", prefix: "bsystem", keys: "sistema system modsystem mundo receitas", title: "ModSystem", desc: "Código ligado ao mundo e às receitas.", folder: "content/Common/Systems", cls: "MeuSistema", body: `export class «1:MeuSistema» extends ModSystem {
    OnWorldLoad() {
        «0»
    }

    PostUpdateWorld() {
    }
}
` },
  { group: "Sistemas", prefix: "bhook", keys: "gancho hook mudar jogo vanilla minishark", title: "Gancho em um método do jogo", desc: "Muda um item do jogo sem criar conteúdo novo, como no HelloMod.", folder: "content/Common/Systems", cls: "MeuGancho", body: `const SetDefaults = Terraria.Item['void SetDefaults(int Type, ItemVariant variant)'];

export class «1:MeuGancho» extends ModSystem {
    Load() {
        SetDefaults.hook((original, self, type, variant) => {
            original(self, type, variant);
            if (type === Terraria.ID.ItemID.Minishark) {
                self.useTime = «2:4»;
                self.useAnimation = 4;«0»
            }
        });
    }
}
` },
];
const JS_INLINE_SNIPPETS = [
  { group: "Trechos", prefix: "brecipe", where: "code", keys: "receita recipe craft fabricar", title: "Receita", desc: "Dentro de AddRecipes().", body: `this.CreateRecipe()
    .AddIngredient(Terraria.ID.ItemID.«1:Wood», «2:10»)
    .AddTile(Terraria.ID.TileID.WorkBenches)
    .Register();«0»` },
  { group: "Trechos", prefix: "bhit", where: "member", bases: ["ModItem"], keys: "acerto acertar hit fogo", title: "Ao acertar um NPC", desc: "Em um ModItem: aplica um debuff.", body: `OnHitNPC(item, player, target, hit, damageDone) {
    target.AddBuff(Terraria.ID.BuffID.«1:OnFire», 180, false);«0»
}` },
  { group: "Trechos", prefix: "blog", where: "code", keys: "log console print mensagem chat", title: "Mensagem no chat", desc: "print escreve no chat do jogo; bl.log, no log.", body: `print(«1:'Olá!'»);«0»` },
];
const JS_SNIPPETS = [...JS_FILE_SNIPPETS, ...JS_INLINE_SNIPPETS];
// Os modelos do tipo do projeto aberto.
const snippetsNow = () => (isJsProject() ? JS_SNIPPETS : ALL_SNIPPETS);
const fileSnippetsNow = () => (isJsProject() ? JS_FILE_SNIPPETS : FILE_SNIPPETS);
