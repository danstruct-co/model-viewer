import { Color, Scene, type MeshStandardMaterial } from "three";
import { BackgroundType, EnvironmentControlParams } from "./types";
import { Sky } from "three-stdlib";
import { backgroundSettings } from "./mapper";
import { InfiniteGridHelper } from "../../object/mesh/infiniteGridHelper";

export default class EnvironmentControl {
  private scene: Scene;
  private backgroundColor: Color;
  private sky: Sky;
  private ground: MeshStandardMaterial;
  private gridHelper?: InfiniteGridHelper;
  private currentType: BackgroundType = "default";
  private isActiveGrid: boolean = false;

  constructor({ scene, color, sky, ground, option }: EnvironmentControlParams) {
    this.scene = scene;
    this.backgroundColor = color;
    this.sky = sky;
    this.ground = ground;

    this.setBackground(option?.defaultBackground ?? "default");
    this.setGridActive(!!option?.defaultGridActive);
  }

  setBackground(type: BackgroundType) {
    const { backgroundColor, groundColor, hasSky } = backgroundSettings[type];

    this.backgroundColor.set(backgroundColor);
    this.ground.color.set(groundColor);
    this.sky.visible = hasSky;

    this.currentType = type;

    this.setGridActive(!!this.gridHelper);
  }

  setGridActive(isActive: boolean) {
    this.removeGrid();

    if (!isActive) {
      return;
    }

    this.addGrid();
  }

  get backgroundType() {
    return this.currentType;
  }

  get gridActive() {
    return this.isActiveGrid;
  }

  private addGrid() {
    const { gridColor } = backgroundSettings[this.currentType];
    this.gridHelper = new InfiniteGridHelper({
      size1: 0.2,
      size2: 1,
      color: gridColor,
      distance: 200,
    });
    this.gridHelper.position.setY(-0.01);
    this.scene.add(this.gridHelper);

    this.isActiveGrid = true;
  }

  private removeGrid() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper = undefined;
    }

    this.isActiveGrid = false;
  }
}
