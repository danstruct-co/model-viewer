import { BackSide, MeshBasicMaterial, SkinnedMesh, type BufferGeometry, type Mesh } from "three";
import outlineGeometryBuilder from "../geometry/outlineGeometryBuilder";

export default class OutlineMesh extends SkinnedMesh {
  constructor(mesh: Mesh) {
    super(
      outlineGeometryBuilder.build(mesh.geometry, 0.002),
      new MeshBasicMaterial({
        color: 0x000000,
        side: BackSide,
        transparent: false,
        fog: false,
        toneMapped: false,
      })
    );

    this.userData.isOutline = true;
    this.renderOrder = mesh.renderOrder - 1;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = false;

    const skinnedMesh = mesh as SkinnedMesh;
    if (!skinnedMesh.isSkinnedMesh) {
      return;
    }

    this.skeleton = skinnedMesh.skeleton;
    this.bindMode = skinnedMesh.bindMode;
    this.bindMatrix = skinnedMesh.bindMatrix.clone();
    this.bindMatrixInverse = skinnedMesh.bindMatrixInverse.clone();
  }
}
