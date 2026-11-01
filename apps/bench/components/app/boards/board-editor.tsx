"use client";

import "@xyflow/react/dist/base.css";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type {
  Connection,
  Edge,
  IsValidConnection,
  Node,
  NodeTypes,
} from "@xyflow/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { RefObject } from "react";

import { AddNode } from "@/components/app/boards/add-node";
import { ApprovalDialog } from "@/components/app/boards/approval";
import {
  BoardName,
  EmptyBoard,
  StaleBanner,
  ZoomControl,
} from "@/components/app/boards/board-chrome";
import { BoardContext } from "@/components/app/boards/board-context";
import type { BoardActions } from "@/components/app/boards/board-context";
import { PlusIcon } from "@/components/app/boards/icons";
import { Inspector } from "@/components/app/boards/inspector";
import { NodeCard } from "@/components/app/boards/node-card";
import {
  flowEdges,
  flowNodes,
  useBoardData,
  useCanvas,
} from "@/components/app/boards/use-board";
import { useRunBeats } from "@/components/app/boards/use-run-beats";
import { Wire } from "@/components/app/boards/wire";
import type { TaskOptions } from "@/components/app/task/fields";
import { SourcePicker } from "@/components/app/task/source-picker";
import { nodeWidth } from "@/lib/app/boards/canvas";
import {
  NODE_KINDS,
  inputOf,
  outputOf,
  wireRefusal,
} from "@/lib/app/boards/model";
import type { NodeKind, RunScope } from "@/lib/app/boards/model";
import { latestRunOf, processForNode } from "@/lib/app/boards/process";
import {
  besidePlacement,
  clearPlacement,
  estimatedHeight,
  revealViewport,
} from "@/lib/app/boards/viewport";
import type { Box } from "@/lib/app/boards/viewport";
import type {
  BoardViewData,
  NodeViewData,
} from "@/lib/app/client/board-schemas";

const NODE_TYPES: NodeTypes = Object.fromEntries(
  NODE_KINDS.map((kind) => [kind, NodeCard])
);
const EDGE_TYPES = { wire: Wire };

/** Where a new node goes: to the right of the selected node when it can
 * take what that node gives, wired in, clear of anything already there;
 * otherwise near the middle of the view, below anything already there. Either way the canvas then pans to
 * keep it in view beside its panel. */
interface Placement {
  readonly x: number;
  readonly y: number;
  /** The node the new one is wired from, when it's placed beside it. */
  readonly from?: string;
}

const placement = (
  kind: NodeKind,
  selected: NodeViewData | null,
  center: { x: number; y: number },
  boxOf: (node: NodeViewData) => Box,
  nodes: readonly NodeViewData[]
): Placement => {
  if (
    selected !== null &&
    inputOf(kind) !== "none" &&
    inputOf(kind) === outputOf(selected.kind)
  ) {
    return {
      from: selected.id,
      ...besidePlacement(
        boxOf(selected),
        { height: estimatedHeight(kind), width: nodeWidth(kind) },
        nodes.map((node) => boxOf(node))
      ),
    };
  }
  return clearPlacement(
    {
      height: estimatedHeight(kind),
      width: nodeWidth(kind),
      x: Math.round(center.x - nodeWidth(kind) / 2),
      y: Math.round(center.y - 60),
    },
    nodes.map((node) => boxOf(node))
  );
};

function ProblemNote({
  onDismiss,
  problem,
}: {
  readonly onDismiss: () => void;
  readonly problem: string;
}) {
  return (
    <div
      className="board-float board-note absolute bottom-4 left-4 z-20 flex items-center gap-3 py-2 pr-2 pl-4"
      role="alert"
    >
      <span className="type-small text-bad flex-1">{problem}</span>
      <button
        className="board-quiet type-small hover:bg-surface px-3"
        onClick={onDismiss}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}

/** ⌘K, anywhere on the Board, opens the add-node picker. */
const useAddShortcut = (setAdding: (adding: boolean) => void) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [setAdding]);
};

type BoardData = ReturnType<typeof useBoardData>;

/** What may be wired to what, and the requests that wire, unwire and
 * remove. */
const useWiring = (data: BoardData) => {
  const { view } = data;
  const boardId = view.board.id;
  const graphNode = (id: string) => {
    const node = view.nodes.find((candidate) => candidate.id === id);
    return node === undefined
      ? undefined
      : {
          id: node.id,
          kind: node.kind,
          pickAssetId: node.pick?.assetId ?? null,
          stale: node.stale,
        };
  };

  const isValidConnection: IsValidConnection = (connection) => {
    const from = graphNode(connection.source);
    const to = graphNode(connection.target);
    return (
      from !== undefined &&
      to !== undefined &&
      wireRefusal(
        from,
        to,
        view.wires.filter((wire) => wire.to !== to.id)
      ) === null
    );
  };

  const handleConnect = (connection: Connection) => {
    void data.send({
      body: { from: connection.source, to: connection.target },
      path: `/api/app/boards/${boardId}/wires`,
    });
  };

  const handleDelete = ({ edges, nodes }: { nodes: Node[]; edges: Edge[] }) => {
    const removed = new Set(nodes.map((node) => node.id));
    for (const node of nodes) {
      void data.send({ path: `/api/app/nodes/${node.id}/remove` });
    }
    for (const edge of edges) {
      if (!removed.has(edge.source) && !removed.has(edge.target)) {
        void data.send({ path: `/api/app/wires/${edge.id}/remove` });
      }
    }
  };

  return { handleConnect, handleDelete, isValidConnection };
};

function Canvas({
  canvas,
  data,
}: {
  readonly canvas: ReturnType<typeof useCanvas>;
  readonly data: BoardData;
}) {
  const wiring = useWiring(data);
  return (
    <ReactFlow
      deleteKeyCode={["Backspace", "Delete"]}
      edgeTypes={EDGE_TYPES}
      edges={canvas.edges}
      fitView
      fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
      isValidConnection={wiring.isValidConnection}
      maxZoom={2}
      minZoom={0.25}
      nodeTypes={NODE_TYPES}
      nodes={canvas.nodes}
      onConnect={wiring.handleConnect}
      onDelete={wiring.handleDelete}
      onNodeDragStop={(_event, _node, moved) => {
        void data.moved(
          moved.map((node) => ({
            id: node.id,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
          }))
        );
      }}
      onNodesChange={canvas.handleNodesChange}
      onPaneClick={() => {
        canvas.select(null);
      }}
      panOnScroll
      proOptions={{ hideAttribution: true }}
    >
      <Background
        color="rgb(28 27 26 / 16%)"
        gap={24}
        size={1}
        variant={BackgroundVariant.Dots}
      />
    </ReactFlow>
  );
}

function EditorHeader({
  board,
  onAdd,
}: {
  readonly board: BoardViewData["board"];
  readonly onAdd: () => void;
}) {
  return (
    <header className="board-rule-bottom flex h-15 shrink-0 items-center justify-between gap-4 pr-4 pl-6">
      <BoardName board={board} />
      <button
        className="board-button is-white pr-4 pl-3"
        onClick={onAdd}
        type="button"
      >
        <PlusIcon />
        Add node
        <kbd className="type-small text-muted font-sans font-normal">⌘K</kbd>
      </button>
    </header>
  );
}

interface Running {
  readonly nodeId: string;
  readonly scope: RunScope;
}

function RunApproval({
  data,
  onDone,
  running,
}: {
  readonly data: BoardData;
  readonly onDone: () => void;
  readonly running: Running;
}) {
  const { view } = data;
  const node = view.nodes.find((item) => item.id === running.nodeId);
  if (node === undefined) {
    return null;
  }
  return (
    <ApprovalDialog
      boardId={view.board.id}
      kind={node.kind}
      nodeId={node.id}
      onClose={onDone}
      onStarted={(run) => {
        onDone();
        void data.started(run);
      }}
      onUseModel={(nodeId, model) => {
        const target = view.nodes.find((item) => item.id === nodeId);
        if (target !== undefined) {
          data.editSettings(target, { model });
        }
      }}
      scope={running.scope}
      version={JSON.stringify(
        view.nodes.map((item) => [item.settings, item.pick?.assetId])
      )}
    />
  );
}

/** What floats over the canvas: the Stale banner, the empty Board's
 * starters, a problem, and the zoom. */
function Stage({
  data,
  onRunStale,
  onStart,
}: {
  readonly data: BoardData;
  readonly onRunStale: (nodeId: string) => void;
  readonly onStart: (kind: NodeKind) => void;
}) {
  const { view } = data;
  return (
    <>
      <StaleBanner
        onRun={(node) => {
          onRunStale(node.id);
        }}
        view={view}
      />
      {view.nodes.length === 0 ? <EmptyBoard onStart={onStart} /> : null}
      {data.problem === null ? null : (
        <ProblemNote
          onDismiss={() => {
            data.setProblem(null);
          }}
          problem={data.problem}
        />
      )}
      <ZoomControl />
    </>
  );
}

/**
 * Keeps the selected node in view. Its panel opens beside the canvas and
 * narrows it, so the canvas pans just enough that the whole node shows.
 * Returns how to read a node's place and size, measured once drawn.
 */
const useReveal = (
  view: BoardViewData,
  selectedId: string | null,
  frame: RefObject<HTMLDivElement | null>
) => {
  const flow = useReactFlow();
  const boxOf = (node: NodeViewData): Box => {
    const measured = flow.getInternalNode(node.id)?.measured;
    return {
      height: measured?.height ?? estimatedHeight(node.kind),
      width: measured?.width ?? nodeWidth(node.kind, node),
      x: node.x,
      y: node.y,
    };
  };
  const reveal = useEffectEvent((id: string) => {
    const node = view.nodes.find((candidate) => candidate.id === id);
    const pane = frame.current;
    if (node === undefined || pane === null) {
      return;
    }
    const next = revealViewport(boxOf(node), flow.getViewport(), {
      height: pane.clientHeight,
      width: pane.clientWidth,
    });
    if (next !== null) {
      void flow.setViewport(next, { duration: 200 });
    }
  });
  useEffect(() => {
    if (selectedId !== null) {
      reveal(selectedId);
    }
  }, [selectedId]);
  return boxOf;
};

function Editor({
  initial,
  options,
}: {
  readonly initial: BoardViewData;
  readonly options: TaskOptions;
}) {
  const data = useBoardData(initial);
  const { view } = data;
  const canvas = useCanvas(view);
  const flow = useReactFlow();
  const frame = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<Running | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const selected =
    view.nodes.find((node) => node.id === canvas.selectedId) ?? null;
  useAddShortcut(setAdding);

  const boxOf = useReveal(view, canvas.selectedId, frame);

  // The run going now is heard live. The panel also reads the latest run of
  // the selected node, which may be an earlier one that has finished. The
  // node and its panel ask `process` of these same feeds.
  const runningId = view.runs.find((run) => run.status === "running")?.id;
  // The run just watched stays held after it ends, so the node and its panel
  // keep what it said instead of fetching it all again.
  const [lastRunning, setLastRunning] = useState<string | null>(null);
  if (runningId !== undefined && runningId !== lastRunning) {
    setLastRunning(runningId);
  }
  const watchedId = runningId ?? lastRunning;
  const selectedRun =
    canvas.selectedId === null
      ? undefined
      : latestRunOf(view.runs, canvas.selectedId);
  const live = useRunBeats(watchedId, data.refresh);
  const earlier = useRunBeats(
    selectedRun !== undefined && selectedRun.id !== watchedId
      ? selectedRun.id
      : null
  );
  const feeds = [live, earlier];

  const addNode = async (kind: NodeKind) => {
    setAdding(false);
    const before = new Set(view.nodes.map((node) => node.id));
    const rect = frame.current?.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 3,
    });
    const next = await data.send({
      body: {
        kind,
        ...placement(kind, selected, center, boxOf, view.nodes),
      },
      path: `/api/app/boards/${view.board.id}/nodes`,
    });
    const added = next?.nodes.find((node) => !before.has(node.id));
    if (added !== undefined) {
      canvas.select(added.id);
      if (kind === "source") {
        setPicking(added.id);
      }
    }
  };

  const actions: BoardActions = {
    chooseSource: setPicking,
    editSettings: data.editSettings,
    makePick: data.makePick,
    now: data.now,
    openRun: (nodeId, scope) => {
      setRunning({ nodeId, scope });
    },
    process: (nodeId) => processForNode(view.runs, feeds, nodeId),
    select: canvas.select,
    selectedId: canvas.selectedId,
    stop: (runId) => {
      void data.stop(runId);
    },
    view,
    words: options,
  };

  const pickingNode = view.nodes.find((node) => node.id === picking);

  return (
    <BoardContext value={actions}>
      <EditorHeader
        board={view.board}
        onAdd={() => {
          setAdding(true);
        }}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1" ref={frame}>
          <Canvas canvas={canvas} data={data} />
          <Stage
            data={data}
            onRunStale={(nodeId) => {
              setRunning({ nodeId, scope: "downstream" });
            }}
            onStart={(kind) => {
              void addNode(kind);
            }}
          />
        </div>
        {selected === null ? null : (
          <Inspector key={selected.id} node={selected} options={options} />
        )}
      </div>
      {adding ? (
        <AddNode
          onAdd={(kind) => {
            void addNode(kind);
          }}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
      {running === null ? null : (
        <RunApproval
          data={data}
          onDone={() => {
            setRunning(null);
          }}
          running={running}
        />
      )}
      <SourcePicker
        label="Choose a Source"
        onPick={(image) => {
          if (pickingNode !== undefined) {
            data.editSettings(pickingNode, { assetId: image.assetId });
          }
        }}
        open={pickingNode !== undefined}
        setOpen={(open) => {
          if (!open) {
            setPicking(null);
          }
        }}
      />
    </BoardContext>
  );
}

/** A Board: the top bar, the canvas and the selected node's panel. */
export function BoardEditor({
  initial,
  options,
}: {
  readonly initial: BoardViewData;
  readonly options: TaskOptions;
}) {
  return (
    <div className="board flex h-dvh flex-col">
      <ReactFlowProvider
        initialEdges={flowEdges(initial)}
        initialNodes={flowNodes(initial)}
      >
        <Editor initial={initial} options={options} />
      </ReactFlowProvider>
    </div>
  );
}
