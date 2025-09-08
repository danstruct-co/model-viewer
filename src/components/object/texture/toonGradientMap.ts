import { DataTexture, NearestFilter, RepeatWrapping } from "three";

export default class ToonGradientMap extends DataTexture {
  constructor() {
    const width = 512;
    const height = 1;
    const size = width * height;
    const data = new Uint8Array(4 * size);

    for (let i = 0; i < width; i++) {
      const stride = i * 4;
      const t = i / width;

      if (t < 0.4) {
        data[stride] = 80;
        data[stride + 1] = 80;
        data[stride + 2] = 80;
        data[stride + 3] = 255;
      } else if (t < 0.7) {
        data[stride] = 140;
        data[stride + 1] = 140;
        data[stride + 2] = 140;
        data[stride + 3] = 255;
      } else {
        data[stride] = 255;
        data[stride + 1] = 255;
        data[stride + 2] = 255;
        data[stride + 3] = 255;
      }
    }

    super(data, width, height);

    this.needsUpdate = true;
    this.magFilter = NearestFilter;
    this.minFilter = NearestFilter;
    this.wrapS = RepeatWrapping;
    this.wrapT = RepeatWrapping;
  }
}
