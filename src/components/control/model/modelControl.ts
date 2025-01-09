import { Object3D, Vector3 } from "three";
import { ModelControlParams } from "./types";

export default class ModelControl {
  scene: Object3D;
  model: Object3D;
  coreNode?: Object3D;
  isMirror: boolean = false;
  isFixed: boolean = false;

  constructor({ scene, nodes, coreNode, option }: ModelControlParams) {
    this.scene = scene;
    this.model = scene.children[0];
    this.coreNode = coreNode;

    Object.keys(nodes).forEach((key) => {
      nodes[key].frustumCulled = false;
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
