import type { BufferGeometry } from "three";

function build(geometry: BufferGeometry, offset: number): BufferGeometry {
  const expandedGeometry = geometry.clone();
  const positions = expandedGeometry.attributes.position;
  let normals = expandedGeometry.attributes.normal;

  if (!normals) {
    expandedGeometry.computeVertexNormals();
    normals = expandedGeometry.attributes.normal;
  }

  if (!positions || !normals) {
    console.warn("Cannot expand geometry: missing position or normal attributes");
    return expandedGeometry;
  }

  const posArray = positions.array as Float32Array;
  const normalArray = normals.array as Float32Array;

  for (let i = 0; i < posArray.length; i += 3) {
    posArray[i] += normalArray[i] * offset;
    posArray[i + 1] += normalArray[i + 1] * offset;
    posArray[i + 2] += normalArray[i + 2] * offset;
  }

  positions.needsUpdate = true;
  return expandedGeometry;
}

export default {
  build,
};
