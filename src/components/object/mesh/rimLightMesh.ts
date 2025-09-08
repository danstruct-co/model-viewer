import { SkinnedMesh, type Mesh } from "three";
import RimLightMaterial from "../material/rimLightMaterial";

export default class RimLightMesh extends SkinnedMesh {
  constructor(mesh: Mesh) {
    super(mesh.geometry, new RimLightMaterial())

    this.userData.isRimLight = true
    this.renderOrder = mesh.renderOrder + 1
    this.castShadow = false
    this.receiveShadow = false
    this.frustumCulled = false
  
    const skinnedMesh = mesh as SkinnedMesh
    if (!skinnedMesh.isSkinnedMesh) {
      return
    }

    this.skeleton = skinnedMesh.skeleton
    this.bindMode = skinnedMesh.bindMode
    this.bindMatrix = skinnedMesh.bindMatrix.clone()
    this.bindMatrixInverse = skinnedMesh.bindMatrixInverse.clone()
  }
}