import { MeshStandardMaterial, Object3D, Vector3, type Mesh } from "three";
import { ModelControlParams, type MaterialType } from "./types";
import { materials } from "./mapper";

export default class ModelControl {
  scene: Object3D;
  model: Object3D;
  coreNode?: Object3D;
  materialType?: MaterialType;
  isMirror: boolean = false;
  isFixed: boolean = false;

  constructor({ scene, nodes, coreNode, materialType, option }: ModelControlParams) {
    this.scene = scene;
    this.model = scene.children[0];
    this.coreNode = coreNode;

    Object.values(nodes).forEach((node) => {
      node.frustumCulled = false;
      const mesh = node as Mesh;
      if (!mesh.isMesh || !(mesh.material instanceof MeshStandardMaterial)) {
        return;
      }

      mesh.material = materials(mesh.material)[materialType ?? "DEFAULT"];
    });

    if (option?.defaultMirrorMode) {
      this.mirror();
    }
    this.isFixed = !!option?.defaultFixed;
  }

  mirror() {
    this.scene.scale.setX(-this.scene.scale.x);
    this.isMirror = !this.isMirror;
  }

  updateOnFrame() {
    if (!this.isFixed || !this.coreNode) {
      return;
    }

    const worldPosition = new Vector3();
    this.coreNode.getWorldPosition(worldPosition);
    worldPosition.setX(0);
    worldPosition.setZ(0);

    const localPosition = this.coreNode.parent!.worldToLocal(worldPosition);
    this.coreNode.position.copy(localPosition);
  }
}
