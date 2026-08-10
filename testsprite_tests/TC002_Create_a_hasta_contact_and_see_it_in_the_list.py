import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# DOMAIN-02: /patients yok → /contacts; Hasta filtresi varsayılan; Ad/Soyad ayrı (#c-first-name / #c-last-name).
# Kaynak→Alt kanal: medium yalnız Kaynak='Dijital Reklam' iken (#c-medium).


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

        # Nav: nav.contacts → 'Kişiler'
        await page.get_by_role("link", name="Kişiler", exact=True).click(timeout=10000)

        # Liste varsayılan tür filtresi Hasta (contacts/+page.svelte defaultTypeApplied).
        # Filtre select aria-label: contacts.list.filterTypeAria → 'Tür filtresi'
        type_filter = page.get_by_label("Tür filtresi", exact=True)
        await expect(type_filter).to_be_visible(timeout=15000)
        # Seçili option metni 'Hasta' olmalı (UUID value; selectedIndex ile doğrula)
        selected_label = await type_filter.evaluate(
            "el => el.options[el.selectedIndex]?.textContent?.trim() ?? ''"
        )
        assert selected_label == "Hasta", f"Default type filter should be Hasta, got {selected_label!r}"

        # contacts.list.new → 'Yeni kişi' (boş listede emptyCta 'Yeni kişi ekle' de olabilir)
        new_btn = page.get_by_role("button", name="Yeni kişi", exact=True)
        if await new_btn.count() == 0:
            new_btn = page.get_by_role("button", name="Yeni kişi ekle", exact=True)
        await new_btn.click(timeout=10000)

        await page.locator('[id="c-first-name"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-first-name"]').fill("Autotest")
        await page.locator('[id="c-last-name"]').fill("Hasta TC002")
        await page.locator('[id="c-type"]').select_option(label="Hasta")
        await page.locator('[id="c-phone"]').fill("5550000002")
        await page.locator('[id="c-email"]').fill("autotest.tc002@verimaya.local")
        await page.locator('[id="c-source"]').select_option(label="Dijital Reklam")
        await page.locator('[id="c-medium"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-medium"]').select_option(label="Meta Ads")
        await page.locator('[id="c-campaign"]').fill("TC002 kampanya")
        await page.locator('[id="c-notes"]').fill("Created by automated test TC002.")

        await page.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)

        # Create → goto /contacts/:id (contacts/+page.svelte saveContact)
        await expect(page).to_have_url(re.compile(r"/contacts/[0-9a-f-]{36}"), timeout=15000)
        await expect(page.get_by_role("heading", name="Autotest Hasta TC002")).to_be_visible(
            timeout=15000
        )
        # Detay kartları: finans özeti, randevular, dosyalar, hasta notları
        await expect(page.get_by_role("heading", name="Finans özeti", exact=True)).to_be_visible()
        await expect(page.get_by_role("heading", name="Randevular", exact=True)).to_be_visible()
        await expect(page.get_by_role("heading", name="Dosyalar", exact=True)).to_be_visible()
        await expect(page.get_by_role("heading", name="Hasta notları", exact=True)).to_be_visible()

        await page.get_by_role("link", name="← Kişiler", exact=True).click(timeout=10000)

        # display_name server'da first+last
        await expect(page.get_by_role("link", name="Autotest Hasta TC002")).to_be_visible(
            timeout=15000
        )
        await expect(page.get_by_text("5550000002", exact=True).first).to_be_visible(timeout=15000)

        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
