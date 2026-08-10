import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# DOMAIN-02 yeni yüzey: /settings/organizations — Firmalar sözlüğü (placeholder 'Yeni firma').


async def run_test():
    pw = None
    browser = None
    context = None

    try:
        pw = await async_api.async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process",
            ],
        )
        context = await browser.new_context()
        context.set_default_timeout(15000)
        page = await context.new_page()

        await page.goto("http://app.localhost:5173")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        await page.locator('[id="email"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="email"]').fill("demo@verimaya.local")
        await page.locator('[id="password"]').fill("LocalDemo1!")
        await page.get_by_role("button", name="Giriş yap", exact=True).click(timeout=10000)

        await page.get_by_role("link", name="Ayarlar", exact=True).click(timeout=10000)

        # settings.nav.organizations.title + description
        firms_link = page.get_by_role(
            "link",
            name="Firmalar Klinik, otel, transfer firmaları — kişi formunda seçilir.",
            exact=True,
        )
        await firms_link.click(timeout=10000)

        await expect(page).to_have_url(re.compile(r"/settings/organizations"), timeout=15000)
        await expect(page.get_by_role("heading", name="Firmalar", exact=True)).to_be_visible()

        await page.get_by_placeholder("Yeni firma", exact=True).fill("TC016 Autotest Firma")
        await page.get_by_role("button", name="Ekle", exact=True).click(timeout=10000)

        await expect(page.get_by_text("TC016 Autotest Firma", exact=True)).to_be_visible(
            timeout=15000
        )

        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
