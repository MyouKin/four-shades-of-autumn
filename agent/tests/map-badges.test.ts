import { describe, expect, it } from "vitest";
import { Matrix4, OrthographicCamera, Vector3 } from "three";
import { getMapBadges, projectMapBadge } from "../../src/scene/ActionBadges";
import { addCity, addUnit, battlefield } from "./helpers";

describe("map action badges", () => {
  it("opens the city reward even when a garrison is on the same tile", () => {
    const game = battlefield();
    const capital = game.cities[0];
    capital.pendingRewards = 1;
    capital.pendingRewardLevels = [2];
    game.cities[1].pendingRewards = 1;
    game.cities[1].pendingRewardLevels = [2];
    addUnit(game, 0, "warrior", capital.x, capital.y);
    expect(getMapBadges(game)).toMatchObject([
      { action: "upgrade", cityName: capital.name },
    ]);
    expect(getMapBadges(game)[0].unitId).toBeUndefined();
  });

  it("offers the occupying unit only once it can capture", () => {
    const game = battlefield();
    const village = addCity(game, 3, 3);
    const unit = addUnit(game, 0, "warrior", village.x, village.y);
    unit.capturedTurn = game.round;
    expect(getMapBadges(game)).toEqual([]);
    game.round++;
    expect(getMapBadges(game)).toMatchObject([
      { action: "capture", unitId: unit.id },
    ]);
    unit.attacked = true;
    expect(getMapBadges(game)).toEqual([]);
  });

  it.each(["warrior", "giant"] as const)(
    "keeps the %s flag tip clear of its HP label while zooming and panning",
    (type) => {
      const game = battlefield();
      game.round++;
      const city = addCity(game, 3, 3);
      const unit = addUnit(game, 0, type, city.x, city.y);
      unit.capturedTurn = game.round - 1;
      const badge = getMapBadges(game)[0];
      const rendered = new Set([badge.tileId]);
      const size = { width: 980, height: 720 };
      const camera = new OrthographicCamera(-490, 490, 360, -360, 0.1, 240);
      const screen = new Vector3();
      const matrix = new Matrix4();
      const [x, , z] = badge.position;
      camera.position.set(x + 13, 17, z + 13);
      camera.lookAt(x, 0, z);
      camera.updateMatrixWorld();
      for (const zoom of [20, 70, 150]) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        matrix.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        );
        expect(projectMapBadge(badge, rendered, matrix, size, screen)).toBe(
          true,
        );
        const health = new Vector3(
          x,
          0.015 + 0.08 + (type === "giant" ? 1.14 : 0.84),
          z,
        ).project(camera);
        const healthLabelTop =
          ((1 - health.y) * size.height) / 2 - (0.34 * 0.7 * zoom) / 2;
        expect(screen.y).toBeLessThan(healthLabelTop);
      }
      expect(projectMapBadge(badge, new Set(), matrix, size, screen)).toBe(
        false,
      );
      camera.position.x += 30;
      camera.updateMatrixWorld();
      matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      expect(projectMapBadge(badge, rendered, matrix, size, screen)).toBe(
        false,
      );
    },
  );

  it("hides model actions outside current vision, during AI turns and after the game", () => {
    const game = battlefield();
    game.cities[0].pendingRewards = 1;
    game.cities[0].pendingRewardLevels = [2];
    game.currentPlayer = 1;
    expect(getMapBadges(game)).toEqual([]);
    game.currentPlayer = 0;
    game.status = "finished";
    expect(getMapBadges(game)).toEqual([]);
    game.status = "playing";
    game.players[0].visible = [];
    expect(getMapBadges(game)).toEqual([]);
  });
});
