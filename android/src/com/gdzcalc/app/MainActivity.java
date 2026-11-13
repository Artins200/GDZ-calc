package com.gdzcalc.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Единственный экран приложения: WebView с локальным содержимым.
 *
 * Почему не file:///android_asset/index.html: страница использует ES-модули
 * (<script type="module">), а для file:// браузер считает origin «непрозрачным»
 * и блокирует импорты как CORS-нарушение. Поэтому ассеты отдаются через
 * виртуальный https-origin https://appassets.androidplatform.net/ — тот же
 * приём, что в androidx.webkit.WebViewAssetLoader, но без зависимостей.
 *
 * Всё содержимое лежит внутри APK, интернет не нужен:
 * сеть запрещена и в манифесте, и в WebSettings.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE_URL = "https://" + HOST + "/";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#f4f5f7"));
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        web.setBackgroundColor(Color.parseColor("#f4f5f7"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Светлый статус-бар с тёмными значками — под минималистичный интерфейс.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().setStatusBarColor(Color.parseColor("#f4f5f7"));
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || !HOST.equals(uri.getHost())) {
                    return blocked();
                }
                return serve(uri.getPath());
            }

            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (!HOST.equals(uri.getHost())) return blocked();
                return serve(uri.getPath());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternally(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternally(request.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.setVisibility(View.VISIBLE);
            }
        });

        if (state != null) {
            web.restoreState(state);
        } else {
            web.loadUrl(BASE_URL + "index.html");
        }

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    /** Внешние ссылки (если появятся) открываем в браузере, а не внутри приложения. */
    private boolean openExternally(String url) {
        if (url == null) return false;
        if (url.startsWith(BASE_URL) || url.startsWith("about:")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            // нет браузера — просто не открываем
        }
        return true;
    }

    /** Ассеты читаются прямо из APK: assets/www/<путь>. */
    private WebResourceResponse serve(String path) {
        String rel = path == null ? "" : path.replaceFirst("^/+", "");
        if (rel.isEmpty()) rel = "index.html";
        if (rel.contains("..")) return notFound();
        String asset = "www/" + rel;
        try {
            InputStream in = getAssets().open(asset);
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(mimeOf(rel), encodingOf(rel), 200, "OK", headers, in);
        } catch (IOException e) {
            // Одностраничное приложение: неизвестный путь отдаём как index.html
            if (rel.indexOf('.') < 0) {
                try {
                    InputStream in = getAssets().open("www/index.html");
                    return new WebResourceResponse("text/html", "utf-8", 200, "OK",
                            new HashMap<String, String>(), in);
                } catch (IOException ignored) { /* падаем в 404 */ }
            }
            return notFound();
        }
    }

    private WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden",
                new HashMap<String, String>(),
                new ByteArrayInputStream("Офлайн-режим: сеть в приложении отключена.".getBytes()));
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(),
                new ByteArrayInputStream("Не найдено".getBytes()));
    }

    private static String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }

    private static String encodingOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg")
                || n.endsWith(".webp") || n.endsWith(".ico")
                || n.endsWith(".woff") || n.endsWith(".woff2")) {
            return null; // бинарные файлы — без перекодировки
        }
        return "utf-8";
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
