import { Group, Object3D, Object3DEventMap } from "three";

export type MaterialType = "DEFAULT" | "FABRIC" | "METALIC";

export type ModelControlParams = {
  scene: Group<Object3DEventMap>;
  nodes: { [name: string]: Object3D<Object3DEventMap> };
  coreNode?: Object3D;
  materialType?: MaterialType;
  option?: {
    defaultMirrorMode?: boolean;
    defaultFixed?: boolean;
  };
};
