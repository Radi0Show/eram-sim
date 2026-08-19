// ERAM full extraction: room instances v2 (color + creation-code names),
// object->sprite map, id resolution, every sprite the three rooms place,
// the board's sounds, and fnt_8bit.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using UndertaleModLib;
using UndertaleModLib.Util;

string OUT = "/tmp/eram_mega";
Directory.CreateDirectory(OUT);
Directory.CreateDirectory(OUT + "/sprites");
Directory.CreateDirectory(OUT + "/sounds");
Directory.CreateDirectory(OUT + "/font");
var worker = new TextureWorker();
string J(string s) => s == null ? "null" : "\"" + s.Replace("\\","\\\\").Replace("\"","\\\"") + "\"";

// ---------- 1. rooms ----------
var roomNames = new[] { "room_board_1_sword", "room_board_2_sword", "room_board_3_sword" };
var wantSprites = new HashSet<string>();
foreach (var rn in roomNames) {
  var room = Data.Rooms.FirstOrDefault(r => r.Name?.Content == rn);
  if (room == null) { Console.WriteLine("!! no room " + rn); continue; }
  var sb = new StringBuilder();
  sb.Append("{ \"room\": " + J(rn) + ", \"instances\": [\n");
  bool first = true;
  foreach (var inst in room.GameObjects) {
    string obj = inst.ObjectDefinition?.Name?.Content ?? "";
    string cc = inst.CreationCode?.Name?.Content;
    string spr = inst.ObjectDefinition?.Sprite?.Name?.Content;
    if (spr != null) wantSprites.Add(spr);
    if (!first) sb.Append(",\n");
    first = false;
    sb.Append("  { \"obj\": " + J(obj)
      + ", \"x\": " + inst.X + ", \"y\": " + inst.Y
      + ", \"sx\": " + inst.ScaleX.ToString(System.Globalization.CultureInfo.InvariantCulture)
      + ", \"sy\": " + inst.ScaleY.ToString(System.Globalization.CultureInfo.InvariantCulture)
      + ", \"imageIndex\": " + inst.ImageIndex
      + ", \"color\": " + inst.Color
      + ", \"rotation\": " + inst.Rotation.ToString(System.Globalization.CultureInfo.InvariantCulture)
      + ", \"cc\": " + J(cc) + " }");
  }
  sb.Append("\n] }\n");
  File.WriteAllText($"{OUT}/inst2_{rn}.json", sb.ToString());
  Console.WriteLine($"room {rn}: {room.GameObjects.Count} instances");
}

// ---------- 2. object map (every board-ish object) ----------
{
  var sb = new StringBuilder(); sb.Append("{\n"); bool first = true;
  foreach (var o in Data.GameObjects) {
    string n = o.Name?.Content ?? "";
    if (!(n.StartsWith("obj_board") || n.StartsWith("obj_b1") || n.StartsWith("obj_b2") || n.StartsWith("obj_b3")
        || n.Contains("gameshow_swordroute") || n.Contains("bluebird_shadow") || n.Contains("spawn_pos"))) continue;
    if (!first) sb.Append(",\n"); first = false;
    sb.Append("  " + J(n) + ": { \"sprite\": " + J(o.Sprite?.Name?.Content)
      + ", \"parent\": " + J(o.ParentId?.Name?.Content) + " }");
    if (o.Sprite?.Name?.Content != null) wantSprites.Add(o.Sprite.Name.Content);
  }
  sb.Append("\n}\n");
  File.WriteAllText(OUT + "/objects.json", sb.ToString());
}

// ---------- 3. id resolution ----------
{
  int[] ids = { 72, 115, 136, 138, 323, 585, 711, 1066, 1186, 1728 };
  var sb = new StringBuilder();
  foreach (var id in ids) {
    string objn = (id >= 0 && id < Data.GameObjects.Count) ? Data.GameObjects[id].Name?.Content : null;
    string sndn = (id >= 0 && id < Data.Sounds.Count) ? Data.Sounds[id].Name?.Content : null;
    string sprn = (id >= 0 && id < Data.Sprites.Count) ? Data.Sprites[id].Name?.Content : null;
    sb.AppendLine($"id {id}: object={objn ?? "-"} sound={sndn ?? "-"} sprite={sprn ?? "-"}");
  }
  File.WriteAllText(OUT + "/ids.txt", sb.ToString());
  Console.WriteLine(sb.ToString());
}

// ---------- 4. sprites ----------
foreach (var extra in new[] {
  "spr_board_flower","spr_board_flower_alt","spr_board_flower_telegraph","spr_board_flower_telegraph_alt",
  "spr_board_flower_alt_closed","spr_board_flower_hurt",
  "spr_board_bluefish_r","spr_board_bluefish_u","spr_board_bluefish_l","spr_board_bluefish_d",
  "spr_board_lizard_r","spr_board_lizard_l","spr_board_lizard_r_hurt","spr_board_lizard_l_hurt",
  "spr_board_throw_reticle","spr_board_spear","spr_board_blue_bird_hurt",
  "spr_board_monster_hurt","spr_board_tree","spr_board_tree_cold","spr_board_shallowwater",
  "spr_board_oasis_border","spr_gameshow_swordroutebg","spr_gameshow_swordroute_tvglow",
  "spr_board_ui_sword","spr_board_ui_icekey","spr_static_effect","spr_whitepx",
  "spr_board_kris_walk_down","spr_board_kris_walk_up","spr_board_kris_walk_left","spr_board_kris_walk_right",
  "spr_board_kris_strike_down","spr_board_kris_strike_up","spr_board_kris_strike_left","spr_board_kris_strike_right",
  "spr_board_kris_hurt","spr_board_cactus_cold",
  "spr_board_monster_outline_docile","spr_board_monster_angery_outline_docile",
}) wantSprites.Add(extra);
{
  var sb = new StringBuilder(); sb.Append("{\n"); bool first = true; int wrote = 0;
  foreach (var sp in Data.Sprites) {
    var nm = sp.Name?.Content;
    if (nm == null || !wantSprites.Contains(nm)) continue;
    if (!first) sb.Append(",\n"); first = false;
    sb.Append("  " + J(nm) + ": { \"w\": " + sp.Width + ", \"h\": " + sp.Height
      + ", \"ox\": " + sp.OriginX + ", \"oy\": " + sp.OriginY + ", \"frames\": " + sp.Textures.Count + " }");
    for (int i = 0; i < sp.Textures.Count; i++) {
      if (sp.Textures[i]?.Texture == null) continue;
      worker.ExportAsPNG(sp.Textures[i].Texture, Path.Combine(OUT, "sprites", $"{nm}_{i}.png"), null, true);
      wrote++;
    }
  }
  sb.Append("\n}\n");
  File.WriteAllText(OUT + "/sprites.json", sb.ToString());
  Console.WriteLine($"sprites: {wrote} frames");
}

// ---------- 5. sounds ----------
{
  var want = new HashSet<string> {
    "snd_board_sword1","snd_board_sword2","snd_board_sword3","snd_board_damage","snd_board_sword_metal",
    "snd_board_playerhurt","snd_hurt1","snd_board_ominous","snd_board_splash","snd_fall","snd_power",
    "snd_board_kill","snd_board_lift","snd_board_escaped","snd_board_throw","snd_bump","snd_wallclaw",
    "snd_link_get_key","snd_link_secret_bad","snd_board_mantle_move","snd_tv_poweron","snd_tvnoise",
  };
  string dataDir = Path.GetDirectoryName(FilePath);
  var groupCache = new Dictionary<int, UndertaleData>();
  UndertaleData LoadGroup(int index) {
    if (groupCache.TryGetValue(index, out var cached)) return cached;
    string p = Path.Combine(dataDir, $"audiogroup{index}.dat");
    if (!File.Exists(p)) { groupCache[index] = null; return null; }
    using (var fs = new FileStream(p, FileMode.Open, FileAccess.Read))
      groupCache[index] = UndertaleIO.Read(fs);
    return groupCache[index];
  }
  int wrote = 0; var misses = new List<string>();
  foreach (var snd in Data.Sounds) {
    string name = snd.Name?.Content;
    if (name == null || !want.Contains(name)) continue;
    byte[] blob = snd.AudioFile?.Data;
    if (blob == null && snd.GroupID > 0) {
      var grp = LoadGroup(snd.GroupID);
      if (grp != null && snd.AudioID >= 0 && snd.AudioID < grp.EmbeddedAudio.Count)
        blob = grp.EmbeddedAudio[snd.AudioID].Data;
    }
    if (blob == null) { misses.Add(name); continue; }
    string ext = (blob.Length > 4 && blob[0] == 'R' && blob[1] == 'I') ? "wav" : "ogg";
    File.WriteAllBytes(Path.Combine(OUT, "sounds", $"{name}.{ext}"), blob);
    wrote++;
  }
  Console.WriteLine($"sounds: {wrote} of {want.Count}" + (misses.Count > 0 ? "  MISSED: " + string.Join(",", misses) : ""));
}

// ---------- 6. fnt_8bit ----------
foreach (var f in Data.Fonts) {
  string name = f.Name?.Content ?? "";
  if (name != "fnt_8bit") continue;
  if (f.Texture != null) worker.ExportAsPNG(f.Texture, Path.Combine(OUT, "font", name + ".png"));
  var sb = new StringBuilder();
  sb.Append("{ \"name\": " + J(name) + ", \"size\": " + f.EmSize + ", \"glyphs\": [\n");
  bool first = true;
  foreach (var g in f.Glyphs) {
    if (!first) sb.Append(",\n"); first = false;
    sb.Append("  { \"c\": " + g.Character + ", \"x\": " + g.SourceX + ", \"y\": " + g.SourceY
      + ", \"w\": " + g.SourceWidth + ", \"h\": " + g.SourceHeight
      + ", \"shift\": " + g.Shift + ", \"offset\": " + g.Offset + " }");
  }
  sb.Append("\n] }\n");
  File.WriteAllText(Path.Combine(OUT, "font", name + ".json"), sb.ToString());
  Console.WriteLine("font: fnt_8bit exported");
}
Console.WriteLine("=== MEGA DONE ===");
