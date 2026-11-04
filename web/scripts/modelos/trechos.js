const INLINE_SNIPPETS = [
  { group: "Trechos", prefix: "brecipe", where: "code", keys: "receita recipe craft fabricar", title: "Receita", desc: "Dentro de AddRecipes().", body: `CreateRecipe(«1:1»)
    .AddIngredient(ItemID.«2:DirtBlock», «3:10»)
    .AddTile(TileID.«4:WorkBenches»)
    .Register();` },
  { group: "Trechos", prefix: "boverrecipes", where: "member", bases: ["ModItem"], keys: "receita recipe addrecipes craft", title: "override AddRecipes", desc: "Método completo para ModItem.", body: `public override void AddRecipes()
{
    CreateRecipe().AddIngredient(ItemID.«1:DirtBlock», «2:10»).Register();
}` },
  { group: "Trechos", prefix: "bhit", where: "member", bases: ["ModItem"], keys: "acerto acertar hit fogo", title: "Ao acertar um NPC", desc: "Em um ModItem: aplica um buff no alvo.", body: `public override void OnHitNPC(Player player, NPC target, NPC.HitInfo hit, int damageDone)
{
    target.AddBuff(BuffID.«1:OnFire», «2:60»);
}` },
  { group: "Trechos", prefix: "bhurt", where: "member", bases: ["ModPlayer"], keys: "dano reduzir hurt protecao", title: "Reduzir dano recebido", desc: "Em um ModPlayer.", body: `public override void ModifyHurt(ref Player.HurtModifiers modifiers)
{
    modifiers.FinalDamage *= «1:0.75»f;
}` },
  { group: "Trechos", prefix: "bdmg", where: "code", keys: "dano bonus damage acessorio", title: "Bônus de dano", desc: "Em UpdateAccessory ou UpdateArmorSet.", body: `player.GetDamage(DamageClass.«1:Generic») += «2:10» / 100f;` },
  { group: "Trechos", prefix: "bspawn", where: "code", keys: "criar projetil spawn new atirar", title: "Criar um projétil", desc: "Dispara um projétil seu a partir do jogador.", body: `Projectile.NewProjectile(player.GetSource_FromThis(), player.Center, velocity, ModContent.ProjectileType<«1:MeuProjetil»>(), «2:10», «3:2»f, player.whoAmI);` },
];
