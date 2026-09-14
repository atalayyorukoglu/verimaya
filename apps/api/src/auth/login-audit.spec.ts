import { describe, expect, it } from "vitest";
import { buildLoginAuditRow, SET_ACTIVE_PATH } from "./login-audit";

const TENANT = "4204bb9b-0c66-48b1-ba97-fa959acab043";

function ctx(over: Record<string, unknown> = {}) {
  return {
    path: SET_ACTIVE_PATH,
    context: {
      session: { user: { id: "u1", name: "Gülçin", email: "g@example.test" } },
      returned: { id: TENANT, name: "OrbisMed" },
    },
    ...over,
  };
}

describe("buildLoginAuditRow", () => {
  it("firma seçildiğinde kaydı çıkarır", () => {
    expect(buildLoginAuditRow(ctx())).toEqual({
      tenantId: TENANT,
      actor: { actorId: "u1", actorDisplayName: "Gülçin" },
    });
  });

  it("başka uçlarda kayıt üretmez", () => {
    // Hook HER istekte çalışıyor; yalnız set-active kayıt yazmalı.
    expect(buildLoginAuditRow(ctx({ path: "/get-session" }))).toBeNull();
    expect(buildLoginAuditRow(ctx({ path: "/sign-in/email" }))).toBeNull();
  });

  it("firmadan çıkışta (returned null) kayıt üretmez", () => {
    expect(
      buildLoginAuditRow(ctx({ context: { session: {}, returned: null } })),
    ).toBeNull();
  });

  it("adı olmayan kullanıcıda e-postaya düşer", () => {
    const r = buildLoginAuditRow(
      ctx({
        context: {
          session: { user: { id: "u2", email: "a@b.test" } },
          returned: { id: TENANT },
        },
      }),
    );
    expect(r?.actor.actorDisplayName).toBe("a@b.test");
  });

  it("kullanıcı hiç çözülemezse yine de kaydı yazar, adı bilinmeyen olur", () => {
    // Kaydı düşürmektense "kim olduğu bilinmiyor" demek yeğdir.
    const r = buildLoginAuditRow(
      ctx({ context: { returned: { id: TENANT } } }),
    );
    expect(r).toEqual({
      tenantId: TENANT,
      actor: { actorId: null, actorDisplayName: "Bilinmeyen kullanıcı" },
    });
  });

  it("beklenmedik şekilde çökmez", () => {
    for (const kotu of [
      null,
      undefined,
      42,
      "metin",
      {},
      { path: SET_ACTIVE_PATH },
    ]) {
      expect(() => buildLoginAuditRow(kotu)).not.toThrow();
    }
  });
});
