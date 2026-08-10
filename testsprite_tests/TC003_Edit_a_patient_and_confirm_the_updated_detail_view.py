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
        
        # -> Fill the 'E-posta' email field with demo@verimaya.local.
        # email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("demo@verimaya.local")
        
        # -> Fill the 'E-posta' email field with demo@verimaya.local.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("LocalDemo1!")
        
        # -> Fill the 'E-posta' email field with demo@verimaya.local.
        # Giriş yap button
        elem = page.get_by_role('button', name='Giriş yap', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Şifre' password field with the provided password and click the 'Giriş yap' button.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("LocalDemo1!")
        
        # -> Fill the 'Şifre' password field with the provided password and click the 'Giriş yap' button.
        # Giriş yap button
        elem = page.get_by_role('button', name='Giriş yap', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Hastalar' link in the left menu to open the Patients list page.
        # Hastalar link
        elem = page.get_by_text('Ana', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Hastalar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Sign in using the 'E-posta' and 'Şifre' fields and the 'Giriş yap' button.
        # email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("demo@verimaya.local")
        
        # -> Sign in using the 'E-posta' and 'Şifre' fields and the 'Giriş yap' button.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("LocalDemo1!")
        
        # -> Sign in using the 'E-posta' and 'Şifre' fields and the 'Giriş yap' button.
        # Giriş yap button
        elem = page.get_by_role('button', name='Giriş yap', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Hastalar' link in the left menu to open the Patients list page.
        # Hastalar link
        elem = page.get_by_text('Ana', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Hastalar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the visible 'İlk dosyayı aç' button to start creating a new patient record.
        # İlk dosyayı aç button
        elem = page.get_by_role('button', name='İlk dosyayı aç', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Oluştur' (Create) button in the 'Yeni dosya aç' dialog to submit the new patient after the required fields are filled.
        # text field
        elem = page.locator('[id="patient-name"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Test Hasta 01")
        
        # -> Click the 'Oluştur' (Create) button in the 'Yeni dosya aç' dialog to submit the new patient after the required fields are filled.
        # text field
        elem = page.locator('[id="patient-phone"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("5551234567")
        
        # -> Click the 'Oluştur' (Create) button in the 'Yeni dosya aç' dialog to submit the new patient after the required fields are filled.
        # email field
        elem = page.locator('[id="patient-email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("test.hasta01@verimaya.app")
        
        # -> Click the 'Oluştur' button to submit the new patient form
        # Oluştur button
        elem = page.get_by_role('button', name='Oluştur', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Düzenle' button on the patient detail view to open the edit form.
        # Düzenle button
        elem = page.get_by_role('button', name='Düzenle', exact=True)
        await elem.click(timeout=10000)
        
        # -> Change the 'Telefon' field to '5550000001' and click the 'Kaydet' button to save the patient changes.
        # text field
        elem = page.locator('[id="patient-phone"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("5550000001")
        
        # -> Change the 'Telefon' field to '5550000001' and click the 'Kaydet' button to save the patient changes.
        # Kaydet button
        elem = page.get_by_role('button', name='Kaydet', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the updated patient detail view is displayed
        # Assert: The URL contains the patient ID, confirming the patient detail page is open.
        await expect(page).to_have_url(re.compile("patients/9a8083eb\\-d727\\-4384\\-abae\\-96eb20c53f23"), timeout=15000), "The URL contains the patient ID, confirming the patient detail page is open."
        await page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/div/div[2]/button").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Düzenle' button is visible on the patient detail view.
        await expect(page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/div/div[2]/button").nth(0)).to_be_visible(timeout=15000), "The 'D\u00fczenle' button is visible on the patient detail view."
        # Assert: The finance link references this patient ID, confirming the detail view is for the updated patient.
        await expect(page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/section[1]/div/div/a").nth(0)).to_have_attribute("href", "/finance?hasta=9a8083eb-d727-4384-abae-96eb20c53f23", timeout=15000), "The finance link references this patient ID, confirming the detail view is for the updated patient."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    