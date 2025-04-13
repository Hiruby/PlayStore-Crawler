import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import fs from 'fs';
import pLimit from 'p-limit';

const TARGET_URL: string[] = [
  'https://play.google.com/store/apps/details?id=com.blockstack.tophero',
  'https://play.google.com/store/apps/details?id=com.gaimstudio.knightage',
  'https://play.google.com/store/apps/details?id=com.flaregames.royalrevolt',
  'https://play.google.com/store/apps/details?id=com.oneper.td.gp',
  'https://play.google.com/store/apps/details?id=hedonic.games.deadshot',
  'https://play.google.com/store/apps/details?id=com.artstorm.td',
  'https://play.google.com/store/apps/details?id=com.dragonest.autochessmini.google',
  'https://play.google.com/store/apps/details?id=com.dreamotion.ronin&pcampaignid=merch_published_cluster_promotion_battlestar_browse_all_games',
  'https://play.google.com/store/apps/details?id=io.battleroyale.magicka',
  'https://play.google.com/store/apps/details?id=com.unimob.stickman.master.shadow',
  'https://play.google.com/store/apps/details?id=com.fattoy.swordash.android',
  'https://play.google.com/store/apps/details?id=com.Jaems.ProjectCreationRPG',
  'https://play.google.com/store/apps/details?id=com.swordfighting.stickmanshadow',
  'https://play.google.com/store/apps/details?id=com.shadow.war.legend.slime.idle.rpg.survival.game',
  'https://play.google.com/store/apps/details?id=com.dreamotion.roadtovalor',
  'https://play.google.com/store/apps/details?id=com.dreamotion.empire',
  'https://play.google.com/store/apps/details?id=com.Dreamotion.GunStrider',
  'https://play.google.com/store/apps/details?id=com.smilegate.outerplane.stove.google&pcampaignid=merch_published_cluster_promotion_battlestar_collection_new_games',
  'https://play.google.com/store/apps/details?id=com.patterncorp.yokai',
  'https://play.google.com/store/apps/details?id=com.eyougame.msen',
  'https://play.google.com/store/apps/details?id=com.sanctumstudio.eternalsenia2',
  'https://play.google.com/store/apps/details?id=com.greenspring.conquestgirls',
  'https://play.google.com/store/apps/details?id=com.com2us.starseedgl.android.google.global.normal',
  'https://play.google.com/store/apps/details?id=com.asobimo.alchemiastory',
];
const CONCURRENCY_LIMIT: number = 3;
const MAX_REVIEWS_PER_RATING = 100;
const OUTPUT_FILE: string = 'playstore_reviews.jsonl';
const CLICK_BUTTON_SELECTOR: string = 'button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-dgl2Hf.ksBjEc.lKxP2d.LQeN7.aLey0c';
const CLICK_WAIT_DELAY: number = 3000; 
const SCROLL_CONTAINER_SELECTOR: string = 'div.fysCi.Vk3ZVd'; 
const SCROLL_DELAY: number = 700; 
const MAX_SCROLL_ATTEMPTS: number = 50; 

const SELECTORS = {
  appNameElement: 'span.AfwdI',
  reviewBlock: 'div.RHo1pe',
  individualReviewContainer: 'div.iXRFPc',
  nameElement: "header.c1bOId > div.YNR7H > div.gSGphe > div.X5PpBb",
  ratingElement: "header.c1bOId > div.Jx4nYe > div[role='img'][aria-label*='Rated']",
  reviewTextElement: 'div.h3YV2d',
  thumbsupElement: 'div[jscontroller="SWD8cc"]',
};

function getUnique (array: string[]) {
  const uniqueSet = new Set(array);
  const uniqueArray = Array.from(uniqueSet);
  return uniqueArray;
}

function parseRating(ariaLabel: string | null) {
  let rating: number = 0;
  if (!ariaLabel) return null;
  const match = ariaLabel.match(/Rated\s*([\d.]+)\s*stars/i) || ariaLabel.match(/Đã xếp hạng\s*([\d,]+)\s*sao/i);
  if (match && match[1]) {
    rating = parseFloat(match[1].replace(',', '.'));

    return rating;
  }

  return null;
}

async function autoScroll(page: Page, scrollableSelector: string, maxAttempts: number, delayMs: number) {
  let currentScrollAttempts = 0;
  let lastHeight = -1; 

  try {
    await page.waitForSelector(scrollableSelector, { visible: true, timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    while (currentScrollAttempts < maxAttempts) {
      const newHeight = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return -2; 
        const scrollHeight = element.scrollHeight;
        element.scrollTop = element.scrollHeight;
        return scrollHeight;
      }, scrollableSelector);

      if (newHeight == -2) {
        break;
      }

      if (newHeight == lastHeight) {
        break;
      }

      lastHeight = newHeight;
      currentScrollAttempts++;
      const currentReviewCount = await page.evaluate((reviewSel) => document.querySelectorAll(reviewSel).length, SELECTORS.individualReviewContainer);

      await new Promise(resolve => setTimeout(resolve, delayMs + Math.random() * 200));

      const isScrollElementVisible = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        return el && (el as HTMLElement).offsetParent !== null; 
      }, scrollableSelector);

      if (!isScrollElementVisible) {
        break;
      }
    }

    if (currentScrollAttempts >= maxAttempts) {
    }
  } catch (error) {
      if (error instanceof Error) {
      } else {
      }
  }
}

async function scrapeSinglePage(url: string): Promise<void> {
  if (!TARGET_URL) {
    process.exit(1); 
  }

  let browser: Browser | null = null; 
  const uniqueReviewKeys = new Set<string>(); 

  try {
    browser = await puppeteer.launch({
        headless: true, 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--lang=en-US,en'
        ]
    });
    const page: Page = await browser.newPage();
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
    });
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const appName = await page.$eval(SELECTORS.appNameElement, el => el.textContent?.trim() || '');

    if (CLICK_BUTTON_SELECTOR) {
      try {
        await page.waitForSelector(CLICK_BUTTON_SELECTOR, { visible: true, timeout: 15000 });
        await page.evaluate((selector) => {
          const buttons = document.querySelectorAll(selector);
          if (buttons.length > 0 && buttons[buttons.length - 1] instanceof HTMLElement) {
            (buttons[buttons.length - 1] as HTMLElement).click();
          } else {
          }
        }, CLICK_BUTTON_SELECTOR);

        await new Promise(resolve => setTimeout(resolve, CLICK_WAIT_DELAY + Math.random() * 200));

        await page.waitForSelector(SCROLL_CONTAINER_SELECTOR, { visible: true, timeout: 10000});
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } else {
      process.exit(1);
    }

    await autoScroll(page, SCROLL_CONTAINER_SELECTOR, MAX_SCROLL_ATTEMPTS, SCROLL_DELAY);

    const reviewElementHandles: ElementHandle<Element>[] = await page.$$(SELECTORS.reviewBlock);
    await new Promise(resolve => setTimeout(resolve, 2000));

    let processedCount = 0;
    let ratingLevelCount = [0, 0, 0, 0, 0];
    let progression = 0;
    for (const handle of reviewElementHandles) {
      processedCount++;
      if (progression == 5) break;
      try {
        const extractedData = await handle.evaluate((el, sels) => {
          let name = '';
          let ratingLabel = null;
          let reviewText = '';
          let thumbsup = 0;
          let error = null;
          let nameElFound = false;
          let ratingElFound = false;
          let textElFound = false;
          let thumbsupElFound = false;

          try { 
            const nameEl = el.querySelector(sels.nameElement);
            nameElFound = !!nameEl; 
            if (nameEl) {
              name = (nameEl as HTMLElement).innerText || nameEl.textContent || '';;
            }

            const ratingEl = el.querySelector(sels.ratingElement);
            ratingElFound = !!ratingEl; 
            if (ratingEl) {
              ratingLabel = ratingEl.getAttribute('aria-label');
            }

            const textEl = el.querySelector(sels.reviewTextElement);
            textElFound = !!textEl;
            if (textEl) {
              reviewText = (textEl as HTMLElement).innerText || textEl.textContent || '';
            }

            const thumbsubEl = el.querySelector(sels.thumbsupElement);
            thumbsupElFound = !!thumbsubEl;
            if (thumbsubEl) {
              thumbsup = parseInt(thumbsubEl.getAttribute('aria-label') || '0', 10);
            }
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }

          return {
            name,
            ratingLabel,
            reviewText: reviewText.trim(),
            thumbsup,
            error,
            nameElFound,
            ratingElFound,
            textElFound,
            thumbsupElFound,
            nameSelectorUsed: sels.nameElement,
            ratingSelectorUsed: sels.ratingElement, 
            textSelectorUsed: sels.reviewTextElement,
            thumbsupSelectorUsed: sels.thumbsupElement,
          };
        }, SELECTORS); 


        if (extractedData.error) {
          continue; 
        }

        if (!extractedData.nameElFound) {
        }
        if (!extractedData.ratingElFound) {
        }
        if (!extractedData.textElFound) {
        }
        if (!extractedData.thumbsupElFound) {
        }

        const name = extractedData.name
        const rating = parseRating(extractedData.ratingLabel);
        const reviewText = extractedData.reviewText;
        const thumbsup = extractedData.thumbsup;
        const uniqueKey = reviewText;

        if (reviewText && !uniqueReviewKeys.has(uniqueKey) && (reviewText.length > 10 || thumbsup > 5)) {
          uniqueReviewKeys.add(uniqueKey);
          const reviewToWrite = {
            app: appName,
            username: name, 
            rating: rating ?? 0, 
            review: reviewText, 
          };
          if (ratingLevelCount[reviewToWrite.rating-1] < MAX_REVIEWS_PER_RATING){
            ratingLevelCount[reviewToWrite.rating-1]++;
            if (ratingLevelCount[reviewToWrite.rating-1] == MAX_REVIEWS_PER_RATING){
              progression++;
            }
            const jsonLine = JSON.stringify(reviewToWrite) + '\n';
            try {
              fs.appendFileSync(OUTPUT_FILE, jsonLine, { encoding: 'utf8' });
            } catch (err) {
            }
          }
        } else if (!reviewText) {
        } else {
        }
      } catch (error) {
      } finally {
        await handle.dispose();
      }
    }
  
  } catch (error) {
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function runTasksWithLimit() {
  const limit = pLimit(CONCURRENCY_LIMIT);
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  const tasks = getUnique(TARGET_URL).map((url, index) => {
    return limit(async () => {
        processedCount++;
        await scrapeSinglePage(url).catch(err => {
          process.exit(1); 
        })
        successCount++;
    });
  });

  try {
    await Promise.all(tasks);
  } catch (error) {
    errorCount = getUnique(TARGET_URL).length - successCount; 
    process.exit(1);
  } finally {
    console.log(`URLs: ${processedCount}`);
    console.log(`Success: ${successCount}`);
    console.log(`Fail: ${errorCount}`);
  }
}

runTasksWithLimit();