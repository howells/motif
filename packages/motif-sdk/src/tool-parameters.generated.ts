// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/sync-tool-parameters.mjs
//
// Every argument each registered fal endpoint accepts, read from fal's own
// OpenAPI document. This exists because an audit found 36 arguments across six
// tools that the registry never mentioned: all of them reachable through
// `--json`, none of them discoverable through `--describe`, which for an
// agent reading the schema to decide what is possible is the same as absent.
//
// `fallback` is the endpoint's own default, not Motif's opinion — a caller who
// sends nothing gets that value. Some of them are surprising: `sam3-image`
// defaults `prompt` to "wheel", so an unprompted call looks for wheels and
// quietly returns nothing when there are none. Motif's deliberate overrides
// live in `defaultOptions` on the entry itself and are applied on top.
//
// Media inputs are omitted; those are `inputField` on the entry.

/** One argument an endpoint accepts. */
export interface FalToolParameter {
  /** Argument name, exactly as fal expects it in the request body. */
  key: string;
  /** fal's own default when the caller sends nothing. */
  fallback?: boolean | number | string | readonly unknown[];
  /** Whether fal rejects the request without it. */
  required?: true;
  /** Compact rendering of fal's declared type, e.g. `enum(a|b)`, `list[string]`. */
  type: string;
}

export const FAL_TOOL_PARAMETERS: Record<string, readonly FalToolParameter[]> = {
  "ben-v2": [
    { key: "seed", type: "integer" },
  ],
  "birefnet": [
    { key: "mask_only", type: "boolean", fallback: false },
    { key: "model", type: "enum(General Use (Light)|General Use (Light 2K)|General Use (Heavy)|Matting|Portrait|General Use (Dynamic))", fallback: "General Use (Light)" },
    { key: "operating_resolution", type: "enum(1024x1024|2048x2048|2304x2304)", fallback: "1024x1024" },
    { key: "output_format", type: "enum(webp|png|gif)", fallback: "png" },
    { key: "output_mask", type: "boolean", fallback: false },
    { key: "refine_foreground", type: "boolean", fallback: true },
  ],
  "bria-eraser": [
    { key: "mask_type", type: "enum(manual|automatic)", fallback: "manual" },
    { key: "preserve_alpha", type: "boolean", fallback: false },
  ],
  "bria-expand": [
    { key: "aspect_ratio", type: "enum(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9)" },
    { key: "canvas_size", type: "list[integer]", required: true },
    { key: "negative_prompt", type: "string", fallback: "" },
    { key: "original_image_location", type: "list[integer]" },
    { key: "original_image_size", type: "list[integer]" },
    { key: "prompt", type: "string", fallback: "" },
    { key: "seed", type: "integer" },
  ],
  "bria-genfill": [
    { key: "negative_prompt", type: "string", fallback: "" },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "prompt", type: "string", required: true },
    { key: "seed", type: "integer" },
  ],
  "bria-rmbg": [

  ],
  "bria-video-rmbg": [
    { key: "background_color", type: "enum(Transparent|Black|White|Gray|Red|Green|Blue|Yellow|Cyan|Magenta|Orange)", fallback: "Black" },
    { key: "output_container_and_codec", type: "enum(mp4_h265|mp4_h264|webm_vp9|mov_h265|mov_proresks|mkv_h265|mkv_h264|mkv_vp9|gif)", fallback: "webm_vp9" },
    { key: "preserve_audio", type: "boolean", fallback: true },
  ],
  "ddcolor": [
    { key: "seed", type: "integer" },
  ],
  "depth-anything": [

  ],
  "dwpose": [
    { key: "draw_mode", type: "enum(full-pose|body-pose|face-pose|hand-pose|face-hand-mask|face-mask|hand-mask)", fallback: "body-pose" },
  ],
  "finegrain-eraser": [
    { key: "mode", type: "enum(express|standard|premium)", fallback: "standard" },
    { key: "prompt", type: "string", required: true },
    { key: "seed", type: "integer" },
  ],
  "flux-outpaint": [
    { key: "auto_crop", type: "boolean", fallback: false },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "expand_bottom", type: "integer", fallback: 0 },
    { key: "expand_left", type: "integer", fallback: 0 },
    { key: "expand_right", type: "integer", fallback: 0 },
    { key: "expand_top", type: "integer", fallback: 0 },
    { key: "mode", type: "enum(high|fast)", fallback: "high" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
  ],
  "got-ocr": [
    { key: "do_format", type: "boolean", fallback: false },
    { key: "multi_page", type: "boolean", fallback: false },
  ],
  "hed": [
    { key: "safe", type: "boolean", fallback: false },
    { key: "scribble", type: "boolean", fallback: false },
  ],
  "hunyuan3d-v3": [
    { key: "back_image_url", type: "string" },
    { key: "enable_pbr", type: "boolean", fallback: false },
    { key: "face_count", type: "integer", fallback: 500_000 },
    { key: "generate_type", type: "enum(Normal|LowPoly|Geometry)", fallback: "Normal" },
    { key: "left_image_url", type: "string" },
    { key: "polygon_type", type: "enum(triangle|quadrilateral)", fallback: "triangle" },
    { key: "right_image_url", type: "string" },
  ],
  "iclight-v2": [
    { key: "background_threshold", type: "number", fallback: 0.67 },
    { key: "cfg", type: "number", fallback: 1 },
    { key: "enable_hr_fix", type: "boolean", fallback: false },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "guidance_scale", type: "number", fallback: 5 },
    { key: "highres_denoise", type: "number", fallback: 0.95 },
    { key: "hr_downscale", type: "number", fallback: 0.5 },
    { key: "image_size", type: "object|enum(square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9)" },
    { key: "initial_latent", type: "enum(None|Left|Right|Top|Bottom)", fallback: "None" },
    { key: "lowres_denoise", type: "number", fallback: 0.98 },
    { key: "mask_image_url", type: "string" },
    { key: "negative_prompt", type: "string", fallback: "" },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "num_inference_steps", type: "integer", fallback: 28 },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "prompt", type: "string", required: true },
    { key: "seed", type: "integer" },
  ],
  "ideogram-layerize-text": [
    { key: "font_file_body_url", type: "string" },
    { key: "font_file_h1_url", type: "string" },
    { key: "font_file_h2_url", type: "string" },
    { key: "font_file_small_url", type: "string" },
    { key: "font_name_body", type: "string" },
    { key: "font_name_h1", type: "string" },
    { key: "font_name_h2", type: "string" },
    { key: "font_name_small", type: "string" },
    { key: "prompt", type: "string" },
    { key: "seed", type: "integer" },
  ],
  "ideogram-reframe": [
    { key: "color_palette", type: "object" },
    { key: "image_size", type: "object|enum(square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9)", required: true },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "rendering_speed", type: "enum(TURBO|BALANCED|QUALITY)", fallback: "BALANCED" },
    { key: "seed", type: "integer" },
    { key: "style", type: "enum(AUTO|GENERAL|REALISTIC|DESIGN)" },
    { key: "style_codes", type: "list[string]" },
    { key: "style_preset", type: "enum(80S_ILLUSTRATION|90S_NOSTALGIA|ABSTRACT_ORGANIC|ANALOG_NOSTALGIA|ART_BRUT|ART_DECO|ART_POSTER|AURA|AVANT_GARDE|BAUHAUS|BLUEPRINT|BLURRY_MOTION|BRIGHT_ART|C4D_CARTOON|CHILDRENS_BOOK|COLLAGE|COLORING_BOOK_I|COLORING_BOOK_II|CUBISM|DARK_AURA|DOODLE|DOUBLE_EXPOSURE|DRAMATIC_CINEMA|EDITORIAL|EMOTIONAL_MINIMAL|ETHEREAL_PARTY|EXPIRED_FILM|FLAT_ART|FLAT_VECTOR|FOREST_REVERIE|GEO_MINIMALIST|GLASS_PRISM|GOLDEN_HOUR|GRAFFITI_I|GRAFFITI_II|HALFTONE_PRINT|HIGH_CONTRAST|HIPPIE_ERA|ICONIC|JAPANDI_FUSION|JAZZY|LONG_EXPOSURE|MAGAZINE_EDITORIAL|MINIMAL_ILLUSTRATION|MIXED_MEDIA|MONOCHROME|NIGHTLIFE|OIL_PAINTING|OLD_CARTOONS|PAINT_GESTURE|POP_ART|RETRO_ETCHING|RIVIERA_POP|SPOTLIGHT_80S|STYLIZED_RED|SURREAL_COLLAGE|TRAVEL_POSTER|VINTAGE_GEO|VINTAGE_POSTER|WATERCOLOR|WEIRD|WOODBLOCK_PRINT)" },
  ],
  "ideogram-tiling": [
    { key: "acceleration", type: "enum(none|low|regular|high)", fallback: "none" },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "expansion_model", type: "enum(None|Medium|Large)", fallback: "Medium" },
    { key: "image_size", type: "object|enum(square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9)", fallback: "square_hd" },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "prompt", type: "string", required: true },
    { key: "rendering_speed", type: "enum(TURBO|BALANCED|QUALITY)", fallback: "BALANCED" },
    { key: "seed", type: "integer" },
    { key: "strength", type: "number", fallback: 0.8 },
    { key: "tiling_mode", type: "enum(both|horizontal|vertical)", fallback: "both" },
  ],
  "image2svg": [
    { key: "color_precision", type: "integer", fallback: 6 },
    { key: "colormode", type: "enum(color|binary)", fallback: "color" },
    { key: "corner_threshold", type: "integer", fallback: 60 },
    { key: "filter_speckle", type: "integer", fallback: 4 },
    { key: "hierarchical", type: "enum(stacked|cutout)", fallback: "stacked" },
    { key: "layer_difference", type: "integer", fallback: 16 },
    { key: "length_threshold", type: "number", fallback: 4 },
    { key: "max_iterations", type: "integer", fallback: 10 },
    { key: "mode", type: "enum(spline|polygon)", fallback: "spline" },
    { key: "path_precision", type: "integer", fallback: 3 },
    { key: "splice_threshold", type: "integer", fallback: 45 },
  ],
  "lighting-restoration": [
    { key: "acceleration", type: "enum(none|regular)", fallback: "regular" },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "guidance_scale", type: "number", fallback: 1 },
    { key: "image_size", type: "object|enum(square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9)" },
    { key: "negative_prompt", type: "string", fallback: " " },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "num_inference_steps", type: "integer", fallback: 6 },
    { key: "output_format", type: "enum(png|jpeg|webp)", fallback: "png" },
    { key: "seed", type: "integer" },
  ],
  "lineart": [
    { key: "coarse", type: "boolean", fallback: false },
  ],
  "marigold-depth": [
    { key: "ensemble_size", type: "integer", fallback: 10 },
    { key: "num_inference_steps", type: "integer", fallback: 10 },
    { key: "processing_res", type: "integer", fallback: 0 },
  ],
  "midas-depth": [
    { key: "a", type: "number", fallback: 6.283185307179586 },
    { key: "bg_th", type: "number", fallback: 0.1 },
    { key: "depth_and_normal", type: "boolean", fallback: false },
  ],
  "midas-preprocessor": [
    { key: "a", type: "number", fallback: 6.283185307179586 },
    { key: "background_threshold", type: "number", fallback: 0.1 },
  ],
  "mlsd": [
    { key: "distance_threshold", type: "number", fallback: 0.1 },
    { key: "score_threshold", type: "number", fallback: 0.1 },
  ],
  "moondream-caption": [
    { key: "length", type: "enum(short|normal|long)", fallback: "normal" },
    { key: "temperature", type: "number" },
    { key: "top_p", type: "number" },
  ],
  "moondream-detect": [
    { key: "preview", type: "boolean", fallback: false },
    { key: "prompt", type: "string", required: true },
  ],
  "moondream-point": [
    { key: "preview", type: "boolean", fallback: false },
    { key: "prompt", type: "string", required: true },
  ],
  "moondream-query": [
    { key: "prompt", type: "string", required: true },
    { key: "reasoning", type: "boolean", fallback: true },
    { key: "temperature", type: "number" },
    { key: "top_p", type: "number" },
  ],
  "nsfw": [

  ],
  "object-removal": [
    { key: "mask_expansion", type: "integer", fallback: 15 },
    { key: "model", type: "enum(low_quality|medium_quality|high_quality|best_quality)", fallback: "best_quality" },
    { key: "prompt", type: "string", required: true },
  ],
  "object-removal-bbox": [
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "mask_expansion", type: "integer", fallback: 15 },
    { key: "model", type: "enum(low_quality|medium_quality|high_quality|best_quality)", fallback: "best_quality" },
  ],
  "object-removal-mask": [
    { key: "mask_expansion", type: "integer", fallback: 15 },
    { key: "model", type: "enum(low_quality|medium_quality|high_quality|best_quality)", fallback: "best_quality" },
  ],
  "patina": [
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "maps", type: "list[enum(basecolor|normal|roughness|metalness|height)]", fallback: ["basecolor","normal","roughness","metalness","height"] },
    { key: "output_format", type: "enum(jpeg|png|webp)", fallback: "png" },
    { key: "seed", type: "integer" },
  ],
  "patina-extract": [
    { key: "enable_prompt_expansion", type: "boolean", fallback: true },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "image_size", type: "object|enum(square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9)", fallback: "square_hd" },
    { key: "maps", type: "list[enum(basecolor|normal|roughness|metalness|height)]", fallback: ["basecolor","normal","roughness","metalness","height"] },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "num_inference_steps", type: "integer", fallback: 8 },
    { key: "output_format", type: "enum(jpeg|png|webp)", fallback: "png" },
    { key: "prompt", type: "string", required: true },
    { key: "seed", type: "integer" },
    { key: "strength", type: "number", fallback: 0.6 },
    { key: "tile_size", type: "integer", fallback: 128 },
    { key: "tile_stride", type: "integer", fallback: 64 },
    { key: "tiling_mode", type: "enum(both|horizontal|vertical)", fallback: "both" },
    { key: "upscale_factor", type: "enum(0|2|4)", fallback: 0 },
  ],
  "pidi": [
    { key: "apply_filter", type: "boolean", fallback: false },
    { key: "safe", type: "boolean", fallback: false },
    { key: "scribble", type: "boolean", fallback: false },
  ],
  "qwen-layered": [
    { key: "acceleration", type: "enum(none|regular|high)", fallback: "regular" },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "guidance_scale", type: "number", fallback: 5 },
    { key: "negative_prompt", type: "string", fallback: "" },
    { key: "num_inference_steps", type: "integer", fallback: 28 },
    { key: "num_layers", type: "integer", fallback: 4 },
    { key: "output_format", type: "enum(png|webp)", fallback: "png" },
    { key: "prompt", type: "string" },
    { key: "seed", type: "integer" },
  ],
  "recraft-vectorize": [

  ],
  "rembg": [
    { key: "crop_to_bbox", type: "boolean", fallback: false },
  ],
  "remove-lighting": [
    { key: "acceleration", type: "enum(none|regular)", fallback: "regular" },
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "guidance_scale", type: "number", fallback: 1 },
    { key: "image_size", type: "object|enum(square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9)" },
    { key: "negative_prompt", type: "string", fallback: " " },
    { key: "num_images", type: "integer", fallback: 1 },
    { key: "num_inference_steps", type: "integer", fallback: 6 },
    { key: "output_format", type: "enum(png|jpeg|webp)", fallback: "png" },
    { key: "seed", type: "integer" },
  ],
  "sam-preprocessor": [

  ],
  "sam2-auto": [
    { key: "min_mask_region_area", type: "integer", fallback: 100 },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "png" },
    { key: "points_per_side", type: "integer", fallback: 32 },
    { key: "pred_iou_thresh", type: "number", fallback: 0.88 },
    { key: "stability_score_thresh", type: "number", fallback: 0.95 },
  ],
  "sam3-1-image": [
    { key: "apply_mask", type: "boolean", fallback: true },
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "include_boxes", type: "boolean", fallback: false },
    { key: "include_scores", type: "boolean", fallback: false },
    { key: "max_masks", type: "integer", fallback: 3 },
    { key: "output_format", type: "enum(jpeg|png|webp)", fallback: "png" },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "prompt", type: "string", fallback: "wheel" },
    { key: "return_multiple_masks", type: "boolean", fallback: false },
  ],
  "sam3-1-video": [
    { key: "apply_mask", type: "boolean", fallback: true },
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "detection_threshold", type: "number", fallback: 0.5 },
    { key: "max_num_objects", type: "integer", fallback: 16 },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "prompt", type: "string", fallback: "" },
    { key: "video_output_type", type: "enum(X264 (.mp4)|VP9 (.webm))", fallback: "X264 (.mp4)" },
  ],
  "sam3-3d-align": [
    { key: "body_mask_url", type: "string" },
    { key: "body_mesh_url", type: "string", required: true },
    { key: "focal_length", type: "number" },
    { key: "object_mesh_url", type: "string" },
  ],
  "sam3-3d-body": [
    { key: "export_meshes", type: "boolean", fallback: true },
    { key: "include_3d_keypoints", type: "boolean", fallback: true },
    { key: "include_mhr_params", type: "boolean", fallback: true },
  ],
  "sam3-3d-objects": [
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "detection_threshold", type: "number" },
    { key: "export_textured_glb", type: "boolean", fallback: false },
    { key: "mask_urls", type: "list[string]" },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "pointmap_url", type: "string" },
    { key: "prompt", type: "string", fallback: "car" },
    { key: "seed", type: "integer" },
  ],
  "sam3-image": [
    { key: "apply_mask", type: "boolean", fallback: true },
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "include_boxes", type: "boolean", fallback: false },
    { key: "include_scores", type: "boolean", fallback: false },
    { key: "max_masks", type: "integer", fallback: 3 },
    { key: "output_format", type: "enum(jpeg|png|webp)", fallback: "png" },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "prompt", type: "string", fallback: "wheel" },
    { key: "return_multiple_masks", type: "boolean", fallback: false },
    { key: "text_prompt", type: "string" },
  ],
  "sam3-image-rle": [
    { key: "apply_mask", type: "boolean", fallback: true },
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "include_boxes", type: "boolean", fallback: false },
    { key: "include_scores", type: "boolean", fallback: false },
    { key: "max_masks", type: "integer", fallback: 3 },
    { key: "output_format", type: "enum(jpeg|png|webp)", fallback: "png" },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "prompt", type: "string", fallback: "wheel" },
    { key: "return_multiple_masks", type: "boolean", fallback: false },
    { key: "text_prompt", type: "string" },
  ],
  "sam3-video": [
    { key: "apply_mask", type: "boolean", fallback: true },
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "detection_threshold", type: "number", fallback: 0.5 },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "prompt", type: "string", fallback: "" },
    { key: "text_prompt", type: "string" },
    { key: "video_output_type", type: "enum(X264 (.mp4)|VP9 (.webm))", fallback: "X264 (.mp4)" },
  ],
  "sam3-video-rle": [
    { key: "apply_mask", type: "boolean", fallback: false },
    { key: "boundingbox_zip", type: "boolean", fallback: false },
    { key: "box_prompts", type: "list[object]", fallback: [] },
    { key: "detection_threshold", type: "number", fallback: 0.5 },
    { key: "frame_index", type: "integer", fallback: 0 },
    { key: "point_prompts", type: "list[object]", fallback: [] },
    { key: "prompt", type: "string", fallback: "" },
  ],
  "scribble": [
    { key: "model", type: "enum(HED|PiDi)", fallback: "HED" },
    { key: "safe", type: "boolean", fallback: false },
  ],
  "seedream-layerize": [
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "enhance_prompt_mode", type: "enum(standard|fast)", fallback: "standard" },
    { key: "image_size", type: "enum(auto|auto_1K|auto_1.5K|auto_2K)", fallback: "auto" },
    { key: "prompt", type: "string", fallback: "" },
  ],
  "seedvr-seamless": [
    { key: "enable_safety_checker", type: "boolean", fallback: true },
    { key: "noise_scale", type: "number", fallback: 0.1 },
    { key: "output_format", type: "enum(png|jpeg|webp)", fallback: "png" },
    { key: "seed", type: "integer" },
    { key: "target_resolution", type: "enum(720p|1080p|1440p|2160p)", fallback: "1080p" },
    { key: "upscale_factor", type: "number", fallback: 2 },
    { key: "upscale_mode", type: "enum(target|factor)", fallback: "factor" },
  ],
  "seedvr-upscale": [
    { key: "noise_scale", type: "number", fallback: 0.1 },
    { key: "output_format", type: "enum(png|jpg|webp)", fallback: "jpg" },
    { key: "seed", type: "integer" },
    { key: "target_resolution", type: "enum(720p|1080p|1440p|2160p)", fallback: "1080p" },
    { key: "upscale_factor", type: "number", fallback: 2 },
    { key: "upscale_mode", type: "enum(target|factor)", fallback: "factor" },
  ],
  "smart-resize": [
    { key: "num_images_per_size", type: "integer", fallback: 1 },
    { key: "output_format", type: "enum(jpeg|png|webp)", fallback: "png" },
    { key: "prompt", type: "string", fallback: "" },
    { key: "resolution", type: "enum(1K|2K|4K)", fallback: "1K" },
    { key: "safety_tolerance", type: "enum(1|2|3|4|5|6)", fallback: "4" },
    { key: "seed", type: "integer" },
    { key: "target_sizes", type: "list[string]", required: true },
  ],
  "teed": [

  ],
  "text-removal": [
    { key: "aspect_ratio", type: "enum(21:9|16:9|4:3|3:2|1:1|2:3|3:4|9:16|9:21)" },
    { key: "guidance_scale", type: "number", fallback: 3.5 },
    { key: "num_inference_steps", type: "integer", fallback: 30 },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "safety_tolerance", type: "enum(1|2|3|4|5|6)", fallback: "2" },
    { key: "seed", type: "integer" },
  ],
  "topaz-adjust": [
    { key: "model", type: "enum(Adjust V2|White Balance|Colorize)", fallback: "Adjust V2" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
  ],
  "topaz-creative": [
    { key: "autoprompt", type: "boolean" },
    { key: "color_preservation", type: "boolean" },
    { key: "creativity", type: "integer" },
    { key: "crop_to_fill", type: "boolean", fallback: false },
    { key: "model", type: "enum(Bloom 2|Bloom|Bloom Realism)", fallback: "Bloom 2" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "upscale_factor", type: "number", fallback: 2 },
  ],
  "topaz-denoise": [
    { key: "model", type: "enum(Normal|Strong|Extreme|Denoise Max)", fallback: "Normal" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
  ],
  "topaz-generative": [
    { key: "autoprompt", type: "boolean" },
    { key: "creativity", type: "integer" },
    { key: "crop_to_fill", type: "boolean", fallback: false },
    { key: "denoise", type: "number" },
    { key: "detail", type: "number" },
    { key: "enhancement_strength", type: "enum(low|medium|high)" },
    { key: "face_enhancement", type: "boolean", fallback: true },
    { key: "face_enhancement_creativity", type: "number", fallback: 0 },
    { key: "face_enhancement_strength", type: "number", fallback: 0.8 },
    { key: "model", type: "enum(Wonder 3.5|Wonder 3|Wonder 2|Wonder|Recover 3|Standard MAX|Redefine|Recovery V2|Recovery)", fallback: "Wonder 3" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "prompt", type: "string" },
    { key: "sharpen", type: "number" },
    { key: "subject_detection", type: "enum(All|Foreground|Background)", fallback: "All" },
    { key: "texture", type: "integer" },
    { key: "upscale_factor", type: "number", fallback: 2 },
  ],
  "topaz-image": [
    { key: "autoprompt", type: "boolean" },
    { key: "creativity", type: "integer" },
    { key: "crop_to_fill", type: "boolean", fallback: false },
    { key: "denoise", type: "number" },
    { key: "detail", type: "number" },
    { key: "enhancement_strength", type: "enum(low|medium|high)" },
    { key: "face_enhancement", type: "boolean", fallback: true },
    { key: "face_enhancement_creativity", type: "number", fallback: 0 },
    { key: "face_enhancement_strength", type: "number", fallback: 0.8 },
    { key: "fix_compression", type: "number" },
    { key: "model", type: "enum(Standard V2|High Fidelity V2|Low Resolution V2|CGI|Text Refine|Wonder 3|Wonder|Standard MAX|Redefine|Recovery V2|Recovery)", fallback: "Standard V2" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "prompt", type: "string" },
    { key: "sharpen", type: "number" },
    { key: "strength", type: "number" },
    { key: "subject_detection", type: "enum(All|Foreground|Background)", fallback: "All" },
    { key: "texture", type: "integer" },
    { key: "upscale_factor", type: "number", fallback: 2 },
  ],
  "topaz-precision": [
    { key: "crop_to_fill", type: "boolean", fallback: false },
    { key: "denoise", type: "number" },
    { key: "face_enhancement", type: "boolean", fallback: true },
    { key: "face_enhancement_creativity", type: "number", fallback: 0 },
    { key: "face_enhancement_strength", type: "number", fallback: 0.8 },
    { key: "fix_compression", type: "number" },
    { key: "model", type: "enum(Standard V2|High Fidelity V3|High Fidelity V2|Low Resolution V2|CGI|Text Refine)", fallback: "Standard V2" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
    { key: "sharpen", type: "number" },
    { key: "strength", type: "number" },
    { key: "subject_detection", type: "enum(All|Foreground|Background)", fallback: "All" },
    { key: "upscale_factor", type: "number", fallback: 2 },
  ],
  "topaz-restore": [
    { key: "model", type: "enum(Recover 3|Dust-Scratch V2)", fallback: "Recover 3" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
  ],
  "topaz-sharpen": [
    { key: "model", type: "enum(Standard|Strong|Lens Blur V2|Motion Blur|Natural|Refocus|Wildlife|Portrait|Auto Sharpen|Super Focus V3|Super Focus V2)", fallback: "Standard" },
    { key: "output_format", type: "enum(jpeg|png)", fallback: "jpeg" },
  ],
  "topaz-transparent": [
    { key: "output_format", type: "string", fallback: "png" },
    { key: "upscale_factor", type: "number", fallback: 2 },
  ],
  "topaz-video": [
    { key: "compression", type: "number" },
    { key: "grain", type: "number" },
    { key: "H264_output", type: "boolean", fallback: false },
    { key: "halo", type: "number" },
    { key: "model", type: "enum(Proteus|Artemis HQ|Artemis MQ|Artemis LQ|Gaia HQ|Gaia CG|Gaia 2|Nyx|Nyx Fast|Nyx XL|Nyx HF|Starlight Precise 2.5|Starlight HQ|Starlight Mini|Starlight Sharp|Starlight Fast 2|Starlight Precise 1|Starlight Precise 2|Starlight Fast 1)", fallback: "Proteus" },
    { key: "noise", type: "number" },
    { key: "recover_detail", type: "number" },
    { key: "target_fps", type: "integer" },
    { key: "upscale_factor", type: "number", fallback: 2 },
  ],
  "trellis-2": [
    { key: "decimation_target", type: "integer", fallback: 500_000 },
    { key: "remesh", type: "boolean", fallback: true },
    { key: "remesh_band", type: "number", fallback: 1 },
    { key: "remesh_project", type: "number", fallback: 0 },
    { key: "resolution", type: "enum(512|1024|1536)", fallback: 1024 },
    { key: "seed", type: "integer" },
    { key: "shape_slat_guidance_interval_end", type: "number", fallback: 1 },
    { key: "shape_slat_guidance_interval_start", type: "number", fallback: 0.6 },
    { key: "shape_slat_guidance_rescale", type: "number", fallback: 0.5 },
    { key: "shape_slat_guidance_strength", type: "number", fallback: 7.5 },
    { key: "shape_slat_rescale_t", type: "number", fallback: 3 },
    { key: "shape_slat_sampling_steps", type: "integer", fallback: 12 },
    { key: "ss_guidance_interval_end", type: "number", fallback: 1 },
    { key: "ss_guidance_interval_start", type: "number", fallback: 0.6 },
    { key: "ss_guidance_rescale", type: "number", fallback: 0.7 },
    { key: "ss_guidance_strength", type: "number", fallback: 7.5 },
    { key: "ss_rescale_t", type: "number", fallback: 5 },
    { key: "ss_sampling_steps", type: "integer", fallback: 12 },
    { key: "tex_slat_guidance_interval_end", type: "number", fallback: 0.9 },
    { key: "tex_slat_guidance_interval_start", type: "number", fallback: 0.6 },
    { key: "tex_slat_guidance_rescale", type: "number", fallback: 0 },
    { key: "tex_slat_guidance_strength", type: "number", fallback: 1 },
    { key: "tex_slat_rescale_t", type: "number", fallback: 3 },
    { key: "tex_slat_sampling_steps", type: "integer", fallback: 12 },
    { key: "texture_size", type: "enum(1024|2048|4096)", fallback: 2048 },
    { key: "uv_unwrap_angle_threshold_deg", type: "number", fallback: 90 },
    { key: "uv_unwrap_global_iterations", type: "integer", fallback: 1 },
    { key: "uv_unwrap_refine_iterations", type: "integer", fallback: 0 },
    { key: "uv_unwrap_smooth_strength", type: "number", fallback: 1 },
  ],
  "zoe-depth": [

  ],
};

/** Arguments a tool accepts, including ones Motif does not surface as flags. */
export function falToolParameters(tool: string): readonly FalToolParameter[] {
  return FAL_TOOL_PARAMETERS[tool] ?? [];
}
