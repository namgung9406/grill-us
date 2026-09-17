import { useQueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { GamePreparation } from "@/games/GamePreparation";
import { getGameDefinition } from "@/games/registry";
import { readSaveMetadata } from "@/games/saveMetadata";
import type { GameLaunchProps, LaunchState } from "@/games/types";
import { createGraphClient } from "@/graph/createGraphClient";
import { GraphProfileService } from "@/graph/GraphProfileService";
import { gameProfileAssetsKey, useGameProfileAssets } from "@/graph/useGameProfileAssets";

import { GameNotFoundPage } from "./GameNotFoundPage";

interface GameLocationState {
  startRequested?: boolean;
}

function hasStartRequest(value: unknown): value is GameLocationState {
  return typeof value === "object" && value !== null && Reflect.get(value, "startRequested") === true;
}

export function GamePage() {
  const { gameId = "" } = useParams();
  const definition = getGameDefinition(gameId);
  const loadGameModule = definition?.load;
  const { acquireGraphToken, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [launchState, setLaunchState] = useState<LaunchState>("idle");
  const [preferredCitizenIds, setPreferredCitizenIds] = useState<readonly string[]>([]);
  const [gameComponent, setGameComponent] = useState<ComponentType<GameLaunchProps> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const launchInFlight = useRef(false);
  const launchAttempt = useRef(0);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocus = useRef(false);
  const service = useMemo(
    () => new GraphProfileService(createGraphClient(acquireGraphToken)),
    [acquireGraphToken],
  );
  const saveMetadata = useMemo(
    () => (user === null ? null : readSaveMetadata(user.objectId)),
    [user],
  );
  const profileQuery = useGameProfileAssets({
    service,
    player: user,
    preferredCitizenIds,
    enabled: launchState === "preparing",
  });

  const beginPreparation = useCallback((preferredIds: readonly string[] = []) => {
    if (launchInFlight.current) {
      return;
    }
    launchInFlight.current = true;
    launchAttempt.current += 1;
    setPreferredCitizenIds(preferredIds);
    setGameComponent(null);
    setErrorMessage(null);
    setLaunchState("preparing");
  }, []);

  useEffect(() => {
    if (!hasStartRequest(location.state) || definition === null || user === null) {
      return;
    }
    void navigate(location.pathname, { replace: true, state: null });
    beginPreparation();
  }, [beginPreparation, definition, location.pathname, location.state, navigate, user]);

  useEffect(() => {
    if (launchState !== "preparing" || loadGameModule === undefined) {
      return undefined;
    }

    const attempt = launchAttempt.current;
    let active = true;
    void loadGameModule()
      .then((module) => {
        if (active && launchAttempt.current === attempt) {
          setGameComponent(() => module.default);
        }
      })
      .catch(() => {
        if (active && launchAttempt.current === attempt) {
          launchInFlight.current = false;
          setErrorMessage("게임 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
          setLaunchState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [launchState, loadGameModule]);

  useEffect(() => {
    if (launchState === "idle" && shouldRestoreFocus.current) {
      shouldRestoreFocus.current = false;
      window.requestAnimationFrame(() => startButtonRef.current?.focus());
    }
  }, [launchState]);

  const cancelPreparation = useCallback(() => {
    launchAttempt.current += 1;
    launchInFlight.current = false;
    shouldRestoreFocus.current = true;
    if (user !== null) {
      void queryClient.cancelQueries({
        queryKey: gameProfileAssetsKey(user.objectId, preferredCitizenIds),
        exact: true,
      });
    }
    setLaunchState("idle");
  }, [preferredCitizenIds, queryClient, user]);

  if (definition === null) {
    return <GameNotFoundPage />;
  }

  if (user === null) {
    return null;
  }

  const profileFailed =
    launchState === "preparing" && profileQuery.isError && !profileQuery.isFetching;
  const profilesReady = profileQuery.data !== undefined && gameComponent !== null;
  const visibleLaunchState: LaunchState = profileFailed
    ? "error"
    : launchState === "preparing" && profilesReady
      ? "ready"
      : launchState;

  if (visibleLaunchState === "running" && gameComponent !== null && profileQuery.data !== undefined) {
    const RunningGame = gameComponent;
    return (
      <RunningGame
        profileAssets={profileQuery.data}
        ownerObjectId={user.objectId}
        onExit={() => {
          void navigate("/games");
        }}
      />
    );
  }

  const preparationState =
    visibleLaunchState === "preparing" || visibleLaunchState === "ready" || visibleLaunchState === "error"
      ? visibleLaunchState
      : null;

  return (
    <section className="mx-auto max-w-5xl py-8">
      <p className="font-mono text-xs font-black text-[#ffbd45]">MISSION BRIEFING</p>
      <h1 className="mt-3 font-mono text-3xl font-black text-white sm:text-4xl">{definition.title}</h1>
      <p className="mt-5 max-w-2xl leading-7 text-[#aab8c2]">{definition.description}</p>

      {visibleLaunchState === "idle" ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            ref={startButtonRef}
            type="button"
            onClick={() => beginPreparation()}
            className="game-command"
          >
            게임 시작
          </button>
          {saveMetadata !== null && (
            <button
              type="button"
              onClick={() => beginPreparation(saveMetadata.citizenUserIds)}
              className="game-command"
            >
              계속하기
            </button>
          )}
        </div>
      ) : preparationState !== null ? (
        <div className="mt-9 max-w-2xl">
          <GamePreparation
            state={preparationState}
            errorMessage={
              profileFailed
                ? "프로필을 준비하지 못했습니다. 잠시 후 다시 시도해주세요."
                : errorMessage
            }
            onCancel={cancelPreparation}
            onRetry={() => {
              if (launchState === "error") {
                beginPreparation(preferredCitizenIds);
              } else {
                void profileQuery.refetch();
              }
            }}
            onEnter={() => setLaunchState("running")}
          />
        </div>
      ) : null}
    </section>
  );
}