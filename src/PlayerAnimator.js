import * as THREE from "three";

/**
 * Drives the FBX AnimationMixer based on player movement state.
 *
 * The Animal Plushies pack has one embedded clip per model (FreeRunning).
 * We reuse it for all states by adjusting playback speed + a procedural
 * idle bob when standing still.
 */
export class PlayerAnimator {
  /**
   * @param {THREE.AnimationMixer|null} mixer
   * @param {THREE.AnimationClip[]} clips - clips from the loaded FBX
   * @param {THREE.Object3D} root - the model root added to appearanceGroup
   */
  constructor(mixer, clips, root, { animated = false, baseRotation = null } = {}) {
    this.mixer = mixer;
    this.root = root;
    this.animated = animated;
    this.baseRotation = baseRotation;
    this.action = null;
    this.state = "idle"; // idle | walk | run | air
    this.bobTime = 0;
    this.tiltAngle = 0;
    this.baseY = root?.position.y ?? 0;

    if (mixer && clips.length > 0) {
      // Prefer a run/walk clip; fall back to first.
      const clip =
        clips.find((c) => /run|walk/i.test(c.name)) ?? clips[0];
      this.action = mixer.clipAction(clip);
      this.action.play();
      this.action.timeScale = 0;
    }
  }

  /**
   * Call every frame from Player.update().
   * @param {number} dt - delta time seconds
   * @param {{ isMoving: boolean, isSprinting: boolean, isGrounded: boolean, isJumping: boolean }} state
   */
  update(dt, { isMoving, isSprinting, isGrounded, isJumping }) {
    const newState = !isGrounded ? "air" : isSprinting ? "run" : isMoving ? "walk" : "idle";

    if (newState !== this.state) {
      this.state = newState;
      this._applyState();
    }

    if (this.mixer) this.mixer.update(dt);

    if (!this.root) return;

    // Procedural idle bob when not moving on ground
    if (this.state === "idle") {
      this.bobTime += dt * 1.8;
      this.root.position.y = this.baseY + Math.sin(this.bobTime) * 0.018;
    } else {
      this.root.position.y = this.baseY;
    }

    // Tilt only for animated plush FBX (never overwrite voxel rotation)
    if (this.animated && this.baseRotation) {
      let targetTilt = 0;
      if (this.state === "run") targetTilt = 0.12;
      else if (this.state === "air") targetTilt = isJumping ? -0.18 : 0.08;
      this.tiltAngle = THREE.MathUtils.lerp(this.tiltAngle, targetTilt, dt * 8);
      this.root.rotation.x = this.baseRotation.x + this.tiltAngle;
      this.root.rotation.y = this.baseRotation.y;
      this.root.rotation.z = this.baseRotation.z;
    }
  }

  _applyState() {
    if (!this.action) return;
    switch (this.state) {
      case "idle":
        this.action.timeScale = 0;
        break;
      case "walk":
        this.action.timeScale = 0.55;
        break;
      case "run":
        this.action.timeScale = 1.0;
        break;
      case "air":
        this.action.timeScale = 0.3;
        break;
    }
  }

  dispose() {
    if (this.mixer) this.mixer.stopAllAction();
  }
}
