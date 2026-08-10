import asyncio
from playwright import async_api
from playwright.async_api import expect

# DOMAIN-02: genel kişi oluşturma — Ad/Soyad ayrı; Klinik + Kurum (#c-organization) + satır içi '+ Yeni firma'.
# Liste varsayılan Hasta filtresi; Klinik görmek için 'Tüm türler' seçilmeli.


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

        # Filtreyi Tüm türler yap (klinik liste için)
        await page.get_by_label("Tür filtresi", exact=True).select_option(label="Tüm türler")
        await page.get_by_role("button", name="Filtrele", exact=True).click(timeout=10000)

        new_btn = page.get_by_role("button", name="Yeni kişi", exact=True)
        if await new_btn.count() == 0:
            new_btn = page.get_by_role("button", name="Yeni kişi ekle", exact=True)
        await new_btn.click(timeout=10000)

        await page.locator('[id="c-first-name"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-first-name"]').fill("Test")
        await page.locator('[id="c-last-name"]').fill("Klinik TC007")
        await page.locator('[id="c-type"]').select_option(label="Klinik")

        # Klinik → #c-organization görünür; '+ Yeni firma' = value __new_organization__
        await page.locator('[id="c-organization"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-organization"]').select_option(label="+ Yeni firma")
        await page.locator('[id="c-new-org-name"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="c-new-org-name"]').fill("TC007 Test Klinik Firması")
        # Satır içi firma Oluştur (contacts.form.organizationCreate)
        # Footer'daki kişi Oluştur ile karışmasın: yeni org kutusundaki birincil sm button
        org_box = page.locator("#c-new-org-name").locator("xpath=ancestor::div[contains(@class,'border')][1]")
        await org_box.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)
        # Firma seçildikten sonra satır içi form kapanır; select'te firma adı görünür
        await expect(page.locator('[id="c-organization"]')).not_to_have_value(
            "__new_organization__", timeout=15000
        )

        await page.locator('[id="c-phone"]').fill("555010007")
        await page.locator('[id="c-email"]').fill("tc007.klinik@example.com")
        await page.locator('[id="c-notes"]').fill("Automated klinik+firma test TC007.")

        # Footer submit: Button type=submit form=contact-form
        await page.locator('button[type="submit"][form="contact-form"]').click(timeout=10000)

        await expect(page.get_by_role("heading", name="Test Klinik TC007")).to_be_visible(
            timeout=15000
        )
        await page.get_by_role("link", name="← Kişiler", exact=True).click(timeout=10000)

        # Liste hâlâ Tüm türler olmalı (clearFilters yapılmadı); satırda ad
        await expect(page.get_by_role("link", name="Test Klinik TC007")).to_be_visible(timeout=15000)

        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
