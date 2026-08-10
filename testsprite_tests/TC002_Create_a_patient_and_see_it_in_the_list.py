import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://app.localhost:5173")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the email field with demo@verimaya.local and the password field with the provided password, then click the 'Giriş yap' button to log in.
        # email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("demo@verimaya.local")
        
        # -> Fill the email field with demo@verimaya.local and the password field with the provided password, then click the 'Giriş yap' button to log in.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("LocalDemo1!")
        
        # -> Fill the email field with demo@verimaya.local and the password field with the provided password, then click the 'Giriş yap' button to log in.
        # Giriş yap button
        elem = page.get_by_role('button', name='Giriş yap', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Hastalar' (Patients) link in the left-side menu to open the Patients page.
        # Hastalar link
        elem = page.get_by_text('Ana', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Hastalar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Yeni dosya aç' (New file) button to open the patient creation form.
        # Yeni dosya aç button
        elem = page.get_by_role('button', name='Yeni dosya aç', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'Ad soyad' with 'Autotest Hasta 2026-08-09', 'Telefon' with '5550000002', 'E-posta' with 'autotest.20260809@verimaya.local', add a note, then submit the form (click 'Oluştur' / press Enter) to create the patient.
        # text field
        elem = page.locator('[id="patient-name"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Autotest Hasta 2026-08-09")
        
        # -> Fill 'Ad soyad' with 'Autotest Hasta 2026-08-09', 'Telefon' with '5550000002', 'E-posta' with 'autotest.20260809@verimaya.local', add a note, then submit the form (click 'Oluştur' / press Enter) to create the patient.
        # text field
        elem = page.locator('[id="patient-phone"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("5550000002")
        
        # -> Fill 'Ad soyad' with 'Autotest Hasta 2026-08-09', 'Telefon' with '5550000002', 'E-posta' with 'autotest.20260809@verimaya.local', add a note, then submit the form (click 'Oluştur' / press Enter) to create the patient.
        # email field
        elem = page.locator('[id="patient-email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("autotest.20260809@verimaya.local")
        
        # -> Fill 'Ad soyad' with 'Autotest Hasta 2026-08-09', 'Telefon' with '5550000002', 'E-posta' with 'autotest.20260809@verimaya.local', add a note, then submit the form (click 'Oluştur' / press Enter) to create the patient.
        # text area
        elem = page.locator('[id="patient-notes"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Created by automated test.")
        
        # -> Click the 'Oluştur' button to submit the new patient record.
        # Oluştur button
        elem = page.get_by_role('button', name='Oluştur', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '← Hastalar' link to return to the Patients list so the new patient 'Autotest Hasta 2026-08-09' can be verified in the list.
        # ← Hastalar link
        elem = page.get_by_role('link', name='← Hastalar', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new patient appears in the list
        # Assert: The new patient's name 'Autotest Hasta 2026-08-09' appears in the patients list.
        await expect(page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/div[2]/table/tbody/tr[1]/td[1]/a").nth(0)).to_have_text("Autotest Hasta 2026-08-09", timeout=15000), "The new patient's name 'Autotest Hasta 2026-08-09' appears in the patients list."
        # Assert: The new patient's phone '5550000002' appears in the patients list.
        await expect(page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/div[2]/table/tbody/tr[1]/td[3]").nth(0)).to_have_text("5550000002", timeout=15000), "The new patient's phone '5550000002' appears in the patients list."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    