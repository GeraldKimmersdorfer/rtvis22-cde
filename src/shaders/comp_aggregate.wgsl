
struct Uniforms {
	gridProperties: vec4<f32>,		// hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,			// the size of the viewport
    gridResolution: vec2<u32>,		// resolution of the grid

    timeRangeBounds: vec4<u32>,     // contains TimeAMin, TimeAMax, TimeBMin, TimeBMax already in the appropriate dm
    monthComparison: i32,           // which month to compare (-1... whole year, 0...January, ...)
    firstMonthIndex: u32,           // contains the index of the first month. (in the dataset the first month is dec 1743 therefore it will be 11)

    gridAspect: u32,                // 1 if grid should respect viewport aspect ratio
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for max values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>,              // color for min values
    colorNull: vec4<f32>            // color for empty cell
};

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>         // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
}

struct TemperatureEntry {
    dm: u32,
    avgt: f32,
    src: u32
}

struct GridEntry {
    mPoint: vec2<f32>,
    value: f32,
    valueN: u32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
/* NOTE: I had to figure out the hardway that compute shaders can't write in an array<vec3<f32>>... */
@group(0) @binding(1) var<storage, read_write> grid: array<GridEntry>;
@group(0) @binding(2) var<storage, read> positions: array<PositionEntry>;
@group(0) @binding(3) var<storage, read> temperatures: array<TemperatureEntry>;

fn pos_inside_circle(pos:vec2<f32>, circle_middle:vec2<f32>, circle_radius:f32) -> bool {
    var distord:vec2<f32> = vec2<f32>(1.0);
    if (uniforms.gridAspect == 1) {
        // In order to take into account that the hexagons might be distorted we'll stretch the points accordingly such that
        // we again can check with a simple circle
        distord.x = f32(uniforms.screenSize.x) / f32(uniforms.screenSize.y);
    }
    return (distance(pos * distord, circle_middle * distord) < circle_radius);
}

@compute @workgroup_size(64)
fn cs_main(
    @builtin(global_invocation_id) globalId: vec3<u32>
) {
    let i: u32 = globalId.x;
    let N: u32 = uniforms.gridResolution.x * uniforms.gridResolution.y;
    var gridValue:GridEntry;
	// Guard against out-of-bounds workgroup sizes
	if (i >= N) {
		return;
	}

    let time_range_bounds:vec4<u32> = uniforms.timeRangeBounds;

    // Note: Executing the compute shader on the grid is probably a more elegant solution!
    let col = i % uniforms.gridResolution.x;
    let row = i / uniforms.gridResolution.x;
    var mPointPos:vec2<f32> = vec2<f32>(f32(col) * uniforms.gridProperties.z, f32(row) * uniforms.gridProperties.y);
    var aspect = f32(uniforms.screenSize.x) / f32(uniforms.screenSize.y);

    if (row % 2 == 1) { // offset for odd rows
        let x0 = uniforms.gridProperties.z / 2.0;
        mPointPos.x += x0;
    }
    gridValue.mPoint = mPointPos;

    //var val:f32 = f32(i) / f32(N);
    var val = 0.0;
    var valN:u32 = 0;

    let posN = arrayLength(&positions);
    var tempSum: vec2<f32> = vec2<f32>(0.0, 0.0);
    var tempN: vec2<u32> = vec2<u32>(0, 0);
    for (var j:u32=0; j < posN; j++) {
        let p:PositionEntry = positions[j];
        // ToDo: Collision should be checked with hexagon not with circle (we have possible overlaps right now)
        // Note: To make it faster we could first check with outer circle to completely discard positions before doing the fine check
        if (pos_inside_circle(p.position, mPointPos, uniforms.gridProperties.x)) {
            for (var k:u32=p.index_bounds[0]; k <= p.index_bounds[1]; k++) {
                let t:TemperatureEntry = temperatures[k];
                if (uniforms.monthComparison > -1) {
                    if ((t.dm + uniforms.firstMonthIndex) % 12 != u32(uniforms.monthComparison)) {
                        continue;
                    }
                }
                if (t.dm >= time_range_bounds[0] && t.dm <= time_range_bounds[1]) {
                    tempSum.x += t.avgt;
                    tempN.x += 1;
                }
                if (t.dm >= time_range_bounds[2] && t.dm <= time_range_bounds[3]) {
                    tempSum.y += t.avgt;
                    tempN.y += 1;
                }
            }  
        }
    }

    if (tempN.x > 0 && tempN.y > 0) { // Check for divbyzero error (no entry in given time range and position)
        var tempAvg: vec2<f32> = tempSum / vec2<f32>(tempN);
        val = tempAvg[1] - tempAvg[0];
        valN = tempN.x + tempN.y;
    }

    gridValue.value = val;
    gridValue.valueN = valN;

    grid[i] = gridValue;
    
}