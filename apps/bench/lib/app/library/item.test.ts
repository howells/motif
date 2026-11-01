import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { describe, expect, it } from "vitest";

import { getLibraryItem } from "./item";

const generation = (id: string, outputs: string[]): AppRow => ({
  id,
  owner_id: "mem_owner",
  task: "generate",
  status: "completed",
  stack_id: id,
  parent_id: null,
  comparison_id: null,
  source_asset_id: null,
  reference_asset_ids: [],
  mask_asset_id: null,
  input: {},
  model: "banana21",
  tier: "balanced",
  mode: null,
  endpoint: "unused",
  request_id: null,
  hold_id: "hld_test",
  output_asset_ids: outputs,
  data: {},
  cost_micros: 80_000,
  cost_basis: "listed",
  cost_status: "settled",
  error_code: null,
  error_message: null,
  retry_of: null,
  prompt: null,
  provider_ms: 1000,
  created_at: new Date(0),
  submitted_at: null,
  completed_at: new Date(1000),
  lease_until: null,
  bound_micros: 100_000,
});

describe("Library source ancestry", () => {
  it("shows the actual second output used as the Source, not its sibling", async () => {
    const sql: AppSql = async (query) => {
      if (query.includes("WITH RECURSIVE chain")) {
        return [{ id: "gen_parent", asset_id: "ast_second" }];
      }
      if (query.includes("g.id = ANY")) {
        return [generation("gen_parent", ["ast_first", "ast_second"])];
      }
      if (query.includes("g.id = $1")) {
        return [
          {
            ...generation("gen_child", ["ast_edit"]),
            source_asset_id: "ast_second",
          },
        ];
      }
      return [];
    };
    const item = await getLibraryItem(sql, "mem_owner", "gen_child");
    expect(item?.madeFrom.map((step) => step.assetId)).toStrictEqual([
      "ast_second",
      "ast_edit",
    ]);
  });
});
