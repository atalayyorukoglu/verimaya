import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# DOMAIN-02: hasta düzenleme /contacts üzerinde; alanlar #c-first-name / #c-phone (eski #patient-* yok).
# Kaydet sonrası detayda Telefon dd güncellenir; finance linki ?contact= (eski ?hasta= değil).


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

        # Önce yeni Hasta oluştur (liste boş olabilir)
        new_btn = page.get_by_role("button", name="Yeni kişi", exact=True)
        if await new_btn.count() == 0:
            new_btn = page.get_by_role("button", name="Yeni kişi ekle", exact=True)
        await new_btn.click(timeout=10000)

        await page.locator('[id="c-first-name"]').fill("Test")
        await page.locator('[id="c-last-name"]').fill("Hasta TC003")
        await page.locator('[id="c-type"]').select_option(label="Hasta")
        await page.locator('[id="c-phone"]').fill("5551234567")
        await page.locator('[id="c-email"]').fill("test.hasta.tc003@verimaya.app")
        # Kaynak zorunlu (Hasta); Bilinmiyor sentinel
        await page.locator('[id="c-source"]').select_option(label="Bilinmiyor")
        await page.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)

        await expect(page).to_have_url(re.compile(r"/contacts/[0-9a-f-]{36}"), timeout=15000)

        await page.get_by_role("button", name="Düzenle", exact=True).click(timeout=10000)
        await page.locator('[id="c-phone"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-phone"]').fill("5550000001")
        await page.get_by_role("button", name="Kaydet", exact=True).click(timeout=10000)

        # Detayda Telefon satırı güncellendi
        await expect(page.get_by_text("5550000001", exact=True).first).to_be_visible(timeout=15000)
        await expect(page.get_by_role("button", name="Düzenle", exact=True)).to_be_visible()
        # Finans listesi linki ?contact= (contacts/[id]/+page.svelte)
        finance_link = page.locator('a[href*="/finance?contact="]').first
        await expect(finance_link).to_be_visible(timeout=15000)
        href = await finance_link.get_attribute("href")
        assert href and "/finance?contact=" in href and "hasta=" not in href

        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
