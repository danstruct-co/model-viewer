import { BackSide, SkinnedMesh, type Mesh, MeshBasicMaterial } from 'three'
import outlineGeometryBuilder from '../geometry/outlineGeometryBuilder'

export default class OutlineMesh extends SkinnedMesh {
  constructor(mesh: Mesh, thickness: number) {
    super(
      outlineGeometryBuilder.build(mesh.geometry, thickness),
      new MeshBasicMaterial({
        color: 0x555555,
        side: BackSide,
        transparent: true,
        fog: false,
        toneMapped: false,
        alphaTest: 0.01,
      })
    )

    this.userData.isOutline = true
    this.renderOrder = mesh.renderOrder - 1
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
