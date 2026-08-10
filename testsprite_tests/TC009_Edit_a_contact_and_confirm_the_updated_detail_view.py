import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# DOMAIN-02: #c-name yok → #c-first-name / #c-last-name; Referans kaynağında #c-referred-by-search.


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

        await page.get_by_role("link", name="Kişiler", exact=True).click(timeout=10000)

        # Referans veren kişi (arama için önceden oluştur)
        new_btn = page.get_by_role("button", name="Yeni kişi", exact=True)
        if await new_btn.count() == 0:
            new_btn = page.get_by_role("button", name="Yeni kişi ekle", exact=True)
        await new_btn.click(timeout=10000)
        await page.locator('[id="c-first-name"]').fill("Referans")
        await page.locator('[id="c-last-name"]').fill("Eden TC009")
        await page.locator('[id="c-type"]').select_option(label="Hasta")
        await page.locator('[id="c-phone"]').fill("5550009001")
        await page.locator('[id="c-source"]').select_option(label="Bilinmiyor")
        await page.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)
        await expect(page.get_by_role("heading", name="Referans Eden TC009")).to_be_visible(
            timeout=15000
        )
        await page.get_by_role("link", name="← Kişiler", exact=True).click(timeout=10000)

        # Düzenlenecek kişi
        new_btn = page.get_by_role("button", name="Yeni kişi", exact=True)
        await new_btn.click(timeout=10000)
        await page.locator('[id="c-first-name"]').fill("Test")
        await page.locator('[id="c-last-name"]').fill("Contact TC009")
        await page.locator('[id="c-type"]').select_option(label="Hasta")
        await page.locator('[id="c-phone"]').fill("555010009")
        await page.locator('[id="c-email"]').fill("tc009@example.com")
        await page.locator('[id="c-source"]').select_option(label="Bilinmiyor")
        await page.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)
        await expect(page).to_have_url(re.compile(r"/contacts/[0-9a-f-]{36}"), timeout=15000)

        await page.get_by_role("button", name="Düzenle", exact=True).click(timeout=10000)
        await page.locator('[id="c-first-name"]').fill("Test")
        await page.locator('[id="c-last-name"]').fill("Contact TC009 Edited")
        await page.locator('[id="c-phone"]').fill("555020009")
        await page.locator('[id="c-email"]').fill("tc009.edited@example.com")
        await page.locator('[id="c-source"]').select_option(label="Referans")
        await page.locator('[id="c-referred-by-search"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-referred-by-search"]').fill("Referans Eden")
        # Arama ≥2 karakter; sonuç butonu display_name
        await page.get_by_role("button", name=re.compile(r"Referans Eden TC009")).first.click(
            timeout=15000
        )
        await page.get_by_role("button", name="Kaydet", exact=True).click(timeout=10000)

        await expect(page.get_by_role("heading", name="Test Contact TC009 Edited")).to_be_visible(
            timeout=15000
        )
        await expect(page.get_by_text("555020009", exact=True).first).to_be_visible()
        await expect(page.get_by_text("tc009.edited@example.com", exact=True).first).to_be_visible()
        await expect(page.get_by_role("link", name="← Kişiler", exact=True)).to_be_visible()
        # Tür rozeti Hasta
        await expect(page.get_by_text("Hasta", exact=True).first).to_be_visible()

        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
