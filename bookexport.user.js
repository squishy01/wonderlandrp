// ==UserScript==
// @name         Barnes & Noble → Discord Full Export (FIXED HYBRID)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Complete BN scraper (header + product table + hydration fix)
// @match        https://www.barnesandnoble.com/*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// ==/UserScript==

(function () {
    'use strict';

    const WEBHOOK_URL = "https://discord.com/api/webhooks/1509962451272073328/gE3Y9eDss4fC-hu2a479bdq8shCP9pP8cUiVlT60q-qunbQbdrcF9hwposc0iLzqM71l";

    // =========================
    // UTILITIES
    // =========================
    const clean = (t) =>
        t?.replace(/\s+/g, ' ').trim() || null;

    function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function safeText(sel) {
        return document.querySelector(sel)?.innerText?.trim() || null;
    }

    // =========================
    // FORCE ACCORDION OPEN (CRITICAL FIX)
    // =========================
    function forceOpenDetails() {
        const btn = document.querySelector('#accordion-toggle-product-details');
        if (btn && btn.getAttribute('aria-expanded') === 'false') {
            btn.click();
        }
    }

    // =========================
    // TABLE SCRAPER (ROBUST)
    // =========================
    function getTable(label) {
        const rows = document.querySelectorAll('.striped-table tr');

        for (const row of rows) {
            const tds = row.querySelectorAll('td');
            if (tds.length < 2) continue;

            const key = tds[0].innerText.toLowerCase();
            const value = tds[1].innerText.trim();

            if (key.includes(label.toLowerCase())) {
                return value;
            }
        }

        return null;
    }

    // =========================
    // MAIN SCRAPE (FIXED ORDER)
    // =========================
    async function getBookData() {

        // 🔥 IMPORTANT: wait for React hydration
        await wait(500);

        forceOpenDetails();
        await wait(600); // let table render AFTER expand

        // =========================
        // HEADER DATA (fixes missing price/title)
        // =========================
        const title = safeText('.product__title');

        const author = safeText('.product__contributor a');

        const price =
            safeText('.product-price div') ||
            safeText('.product-price');

        const format =
            safeText('.product__option[aria-checked="true"]');

        const description =
            safeText('.product-description');

        const image =
            document.querySelector('meta[property="og:image"]')?.content;

        // =========================
        // PRODUCT TABLE DATA
        // =========================
        const publicationDate = getTable("Publication Date");

        const pageCountRaw = getTable("Page Count");
        const pageCount =
            pageCountRaw ? pageCountRaw.replace(/pages?/i, '').trim() : null;

        const series = getTable("Series");
        const publisher = getTable("Publisher");
        const isbn = getTable("ISBN-13");
        const dimensions = getTable("Product Dimensions");

        // =========================
        // FINAL OBJECT
        // =========================
        return {
            title,
            author,
            format,
            description,
            image,
            publicationDate,
            pageCount,
            series,
            publisher,


            url: location.href
        };
    }

    // =========================
    // DISCORD SENDER
    // =========================
    function sendToDiscord(book, btn) {

    const fields = [];

    // =========================
    // AUTHOR (CLICKABLE LINK)
    // =========================
    if (book.author) {
        const authorEl = document.querySelector('.product__contributor a');
        const authorUrl = authorEl ? new URL(authorEl.getAttribute('href'), location.origin).href : null;

        fields.push({
            name: "Author",
            value: authorUrl
                ? `[${book.author}](${authorUrl})`
                : book.author,
            inline: true
        });
    }

    // =========================
    // PRICE / FORMAT
    // =========================
    if (book.price) fields.push({ name: "Price", value: book.price, inline: true });
    if (book.format) fields.push({ name: "Format", value: book.format, inline: true });

    // =========================
    // TABLE DATA
    // =========================
    if (book.publicationDate) fields.push({ name: "Publication Date", value: book.publicationDate, inline: true });
    if (book.pageCount) fields.push({ name: "Page Count", value: book.pageCount, inline: true });

    // =========================
    // SERIES (CLICKABLE LINK)
    // =========================
    if (book.series) {
        const seriesEl = document.querySelector('a[href*="/search?attributes.mfield_bnb__seriesTitle"]');
        const seriesUrl = seriesEl ? new URL(seriesEl.getAttribute('href'), location.origin).href : null;

        fields.push({
            name: "Series",
            value: seriesUrl
                ? `[${book.series}](${seriesUrl})`
                : book.series,
            inline: true
        });
    }

    // =========================
    // OTHER FIELDS
    // =========================
    if (book.publisher) fields.push({ name: "Publisher", value: book.publisher, inline: true });
    if (book.isbn) fields.push({ name: "ISBN-13", value: book.isbn, inline: false });
    if (book.dimensions) fields.push({ name: "Dimensions", value: book.dimensions, inline: true });

    const payload = {
        username: "Barnes & Noble Export",
        embeds: [{
            title: book.title || "Unknown Title",
            url: book.url,
            description: book.description
                ? (book.description.length > 900
                    ? book.description.slice(0, 900) + "..."
                    : book.description)
                : null,
            thumbnail: book.image ? { url: book.image } : undefined,
            fields,
            footer: { text: "BN Book Export" }
        }]
    };

    GM_xmlhttpRequest({
        method: "POST",
        url: WEBHOOK_URL,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(payload),

        onload: (res) => {
            btn.textContent = res.status >= 200 && res.status < 300 ? "Sent ✓" : "Failed ✕";
            setTimeout(() => {
                btn.textContent = "Send to Discord";
                btn.disabled = false;
            }, 2000);
        },

        onerror: () => {
            btn.textContent = "Failed ✕";
            setTimeout(() => {
                btn.textContent = "Send to Discord";
                btn.disabled = false;
            }, 2000);
        }
    });
}

    // =========================
    // BUTTON
    // =========================
    function createButton() {
        if (document.getElementById("bn-export-btn")) return;

        const btn = document.createElement("button");
        btn.id = "bn-export-btn";
        btn.textContent = "Send to Discord";

        Object.assign(btn.style, {
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 999999,
            background: "#5865F2",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            padding: "12px 16px",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
        });

        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = "Sending...";

            const book = await getBookData();

            console.log("FULL BOOK DATA:", book);

            sendToDiscord(book, btn);
        };

        document.body.appendChild(btn);
    }

    window.addEventListener("load", () => {
        setTimeout(createButton, 1200);
    });

})();
