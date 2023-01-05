
struct Uniforms {
	screenSize: vec2<f32>,
	formSize: f32,
    deltaT: f32,
    resolution: vec2<f32>
};

@group(0) @binding(0) var<storage, read_write> values: array<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(32)
fn cs_main(
    @builtin(global_invocation_id) globalId: vec3<u32>
) {
    let i: u32 = globalId.x;
	let res: vec2<u32> = vec2<u32>(uniforms.resolution);
    let N: u32 = res.x * res.y;	
	// Guard against out-of-bounds workgroup sizes
	if (i >= N) {
		return;
	}
	
    values[i] = f32(i) / f32(N);
}