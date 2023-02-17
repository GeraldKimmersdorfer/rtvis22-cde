@fragment
fn fs_main(@location(0) vColor: vec4<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
	let distanceFromCenterSquared = dot(uv, uv);
	if (distanceFromCenterSquared > 1f) {
		discard;
	}
	//if (distanceFromCenterSquared > 0.9f) {
	//	return vec4<f32>(0f, 0f, 0f, 1f); // Stroke/Border of circle
	//}
	return vec4<f32>(0.68f, 0.85f, 0.9f, 1f); // Fill of circle
}