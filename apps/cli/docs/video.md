# Video generation

Turning an image into a short clip with `motif --video`: flags, duration, audio and cost. Part of the [CLI agent guide](../AGENTS.md). Prices are in the [cost reference](costs.md#video).

Generate video from an image using Kling v3 Pro:

```bash
# Generate 5s video from an image
motif --video image.png "camera slowly zooms in"

# Without audio (cheaper)
motif --video image.png "smooth pan left" --video-no-audio

# Custom duration (3-15 seconds)
motif --video image.png "cinematic motion" --video-duration 10

# From last generation
motif --video "camera orbits around the subject"

# Dry-run first (video is expensive!)
motif --dry-run --video image.png "slow zoom"

# Via stdin JSON
echo '{"command":"video","imagePath":"image.png","prompt":"zoom in","duration":5}' | motif
```

## Video Invariants

- **Always `--dry-run` first.** A 10s video with audio costs $1.68.
- **Generation takes 30-120 seconds.** The CLI polls automatically.
- **Output is `.mp4`.** Use `--video-no-audio` for silent video (40% cheaper).
- **Duration range is 3-15 seconds.**
- **Aspect ratio is determined by the source image dimensions.**
