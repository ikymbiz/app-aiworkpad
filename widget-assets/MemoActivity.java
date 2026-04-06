package __PACKAGE_NAME__;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;

public class MemoActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupHalfScreenWindow();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Capacitor と同じオリジン (https://localhost) から配信して IndexedDB を共有
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("localhost")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        // JavaScript → Native ブリッジ
        webView.addJavascriptInterface(new MemoJSInterface(), "MemoInterface");

        // https://localhost/public/memo.html で読み込み（Capacitor と同一オリジン）
        webView.loadUrl("https://localhost/public/memo.html");
    }

    private void setupHalfScreenWindow() {
        WindowManager.LayoutParams params = getWindow().getAttributes();
        params.gravity = Gravity.BOTTOM;
        params.width = WindowManager.LayoutParams.MATCH_PARENT;
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        params.height = (int) (screenHeight * 0.5);
        getWindow().setAttributes(params);
        getWindow().setBackgroundDrawableResource(android.R.color.white);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        params.dimAmount = 0.4f;
    }

    private class MemoJSInterface {

        @JavascriptInterface
        public void openInApp(String docId) {
            runOnUiThread(() -> {
                Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (intent == null) {
                    intent = new Intent(Intent.ACTION_MAIN);
                    intent.setPackage(getPackageName());
                }
                if (docId != null && !docId.isEmpty()) {
                    intent.putExtra("open_doc_id", docId);
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(intent);
                finish();
            });
        }

        @JavascriptInterface
        public void closeMemo() {
            runOnUiThread(() -> finish());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
