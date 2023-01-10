
// Returns true if current browser supports WebGPU
export const CheckWebGPU = () => {
  return "gpu" in navigator;
}

export const getMonthDifference = (d1:Date, d2:Date):number => {
  var months = (d2.getFullYear() - d1.getFullYear()) * 12;
  months -= d1.getMonth();
  months += d2.getMonth();
  return months;
}

export const formatMilliseconds = (s:number) =>  {
  if (s < 1000) {
    return `${s.toFixed(0)} ms`;
  } else if (s < 60000) {
    return `${(s/1000).toFixed(2)} s`;
  } else if (s < 3600000) {
    return `${(s/60000).toFixed(2)} min`;
  } else {
    return `${(s/3600000).toFixed(2)} h`;
  }
}

export const CreateGPUBuffer = (device:GPUDevice, data:ArrayBuffer, 
  usageFlag:GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) => {
  const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usageFlag,
      mappedAtCreation: true
  });
  new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data));
  buffer.unmap();
  return buffer;
}