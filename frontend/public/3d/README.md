# 3D Models

Current models are CC0 photogrammetry scans from Poly Haven
(polyhaven.com), cropped to the largest clump, bottom-centred, quantised
and Draco-compressed via gltf-transform (199–404 KB each). They act as
free stand-ins until Krystal's own Blender exports land.

Pipeline for your own models:
Blender 4.2 → export Draco GLB (<2MB) → place here as <template-id>.glb
(e.g. paper-rose.glb). iOS Quick Look additionally wants a .usdz via
macOS Reality Converter; Android/WebXR work from GLB alone.
The AR viewer probes each file and activates automatically once a real
GLB (>1KB, model/gltf-binary) exists. Cached 30d via Workbox.
