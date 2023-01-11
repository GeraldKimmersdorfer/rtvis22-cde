export const CheckWebGPU = () => {
    return "gpu" in navigator;
}

export const getMonthDifference = (d1: Date, d2: Date): number => {
    var months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months;
}

export const formatMilliseconds = (s: number) => {
    if (s < 1000) {
        return `${s.toFixed(0)} ms`;
    } else if (s < 60000) {
        return `${(s / 1000).toFixed(2)} s`;
    } else if (s < 3600000) {
        return `${(s / 60000).toFixed(2)} min`;
    } else {
        return `${(s / 3600000).toFixed(2)} h`;
    }
}

export const createGpuBuffer = <T extends Uint8Array | Uint32Array | Float32Array>(
    device: GPUDevice,
    data: ArrayLike<number> | ArrayBufferLike,
    type: new(array: ArrayLike<number> | ArrayBufferLike) => T,
    usageFlags: GPUBufferUsageFlags
): GPUBuffer => {
    const dataArray = new type(data);

    const buffer = device.createBuffer({
        size: dataArray.byteLength,
        usage: usageFlags,
        mappedAtCreation: true
    });

    new type(buffer.getMappedRange()).set(dataArray);
    buffer.unmap();
    return buffer;
}

export const createEmptyGPUBuffer = (
    device: GPUDevice,
    size: number,
    usageFlag: GPUBufferUsageFlags
): GPUBuffer => {
    return device.createBuffer({
        size: size,
        usage: usageFlag
    });
}
