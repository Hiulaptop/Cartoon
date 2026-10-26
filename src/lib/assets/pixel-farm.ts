import type { AssetKind } from "./naming";

// Bộ asset pixel art cố định cho bài giảng thuật toán (spec 2026-10-25-story-pixel-assets §6). Mô tả bằng tiếng Anh cho model ảnh.
export const PIXEL_FARM_SERIES = "Pixel Farm";

export const PIXEL_FARM_ASSETS: { name: string; kind: AssetKind; displayName: string; description: string }[] = [
  { name: "bg_meadow", kind: "bg", displayName: "Đồng cỏ", description: "Wide sunny meadow background: bright green grass field with small darker grass tufts and tiny white and yellow flowers, light blue sky with a few blocky white clouds, a gentle rolling hill on the horizon." },
  { name: "bg_forest", kind: "bg", displayName: "Khu rừng", description: "Wide forest clearing background: rows of round dark-green trees with brown trunks at both sides, mossy green grass floor with a narrow dirt path in the middle, soft dappled light, deep green and blue-green palette." },
  { name: "chr_cat", kind: "chr", displayName: "Mèo", description: "A small orange tabby cat with a white chest and paws, pointed ears, a long curved tail and big friendly eyes, sitting upright and facing the viewer." },
  { name: "chr_dog", kind: "chr", displayName: "Chó", description: "A friendly beige and brown puppy with floppy dark-brown ears, a black nose, a short wagging tail and a red collar, standing and facing the viewer." },
  { name: "chr_rabbit", kind: "chr", displayName: "Thỏ", description: "A fluffy white rabbit with tall ears pink on the inside, a small pink nose and a round cotton tail, standing on two legs and facing the viewer." },
  { name: "chr_chicken", kind: "chr", displayName: "Gà", description: "A plump white hen with a red comb and wattle, a small orange beak, yellow legs and a fan of white tail feathers, standing and facing the viewer." },
  { name: "chr_farmer", kind: "chr", displayName: "Bác nông dân", description: "A cheerful farmer with a straw hat, blue overalls over a red checkered shirt, brown boots and a friendly smile, standing and facing the viewer." },
  { name: "prop_tree", kind: "prop", displayName: "Cây", description: "A round leafy oak tree with a thick brown trunk and layered green foliage with lighter highlights, a few small red apples among the leaves." },
  { name: "prop_bush", kind: "prop", displayName: "Bụi cây", description: "A small round green bush with lighter green leaf clusters and a few tiny pink berries." },
  { name: "prop_water_bucket", kind: "prop", displayName: "Thùng nước", description: "A wooden water bucket with two iron bands and a rope handle, filled with blue water with a white sparkle highlight." },
  { name: "prop_well", kind: "prop", displayName: "Giếng nước", description: "A stone water well with a round gray brick wall, a small wooden roof with red tiles, a crank with a rope and a hanging bucket." },
  { name: "prop_fence", kind: "prop", displayName: "Hàng rào", description: "A short section of white-painted wooden picket fence with three pointed posts and two horizontal rails." },
  { name: "prop_crate", kind: "prop", displayName: "Thùng gỗ", description: "A wooden storage crate made of light brown planks with darker corner braces and nail dots." },
  { name: "prop_basket", kind: "prop", displayName: "Giỏ đan", description: "A woven wicker basket with a curved handle, empty, light tan with darker weave lines." },
  { name: "prop_flower", kind: "prop", displayName: "Bông hoa", description: "A single tall flower with a yellow center, white petals, a green stem and two leaves." },
  { name: "prop_rock", kind: "prop", displayName: "Tảng đá", description: "A medium gray boulder with rounded edges, lighter highlights on top, small cracks and a little moss on one side." },
  { name: "prop_signpost", kind: "prop", displayName: "Biển chỉ đường", description: "A wooden signpost with an arrow-shaped blank board on a brown post, with no text." },
  { name: "prop_fish", kind: "prop", displayName: "Con cá", description: "A single orange and silver fish with a forked tail, one round black eye and a white belly, side view." },
  { name: "prop_apple", kind: "prop", displayName: "Quả táo", description: "A single shiny red apple with a short brown stem and a small green leaf." },
  { name: "fx_sparkle", kind: "fx", displayName: "Lấp lánh", description: "A four-pointed star-shaped sparkle effect in white and bright yellow, with a few tiny dot sparkles around it." },
];
