/**
 * Vercel Serverless Function: 記事コンテンツを取得してMarkdownに変換
 */

module.exports = async function handler(req, res) {
    // CORSヘッダーを設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONSリクエストの処理
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // GETリクエストのみ許可
    if (req.method !== 'GET') {
        res.status(405).json({ success: false, error: 'Method not allowed' });
        return;
    }

    try {
        const { url } = req.query;

        if (!url) {
            res.status(400).json({ success: false, error: "Missing 'url' parameter" });
            return;
        }

        // URLを取得
        const targetUrl = decodeURIComponent(url);

        // HTMLを取得
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const htmlContent = await response.text();

        // HTML内のH1タグを確認（デバッグ用）
        const h1Matches = htmlContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
        console.log(`[DEBUG] Found ${h1Matches ? h1Matches.length : 0} H1 tags in HTML`);
        if (h1Matches) {
            h1Matches.forEach((h1, index) => {
                const textMatch = h1.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                if (textMatch) {
                    console.log(`[DEBUG] H1 ${index + 1}: ${textMatch[1].trim().substring(0, 100)}`);
                }
            });
        }
        
        // HTMLの構造を確認（デバッグ用）
        const hasArticle = /<article[^>]*>/i.test(htmlContent);
        const hasMain = /<main[^>]*>/i.test(htmlContent);
        const hasArticleContent = /class="[^"]*article[^"]*content[^"]*"/i.test(htmlContent);
        console.log(`[DEBUG] HTML structure: hasArticle=${hasArticle}, hasMain=${hasMain}, hasArticleContent=${hasArticleContent}`);

        // HTMLをMarkdownに変換
        const markdownContent = htmlToMarkdown(htmlContent);

        // Markdown内のH1を確認（デバッグ用）
        const markdownH1Matches = markdownContent.match(/^#\s+.+$/gm);
        console.log(`[DEBUG] Found ${markdownH1Matches ? markdownH1Matches.length : 0} H1 in Markdown`);
        if (markdownH1Matches) {
            markdownH1Matches.forEach((h1, index) => {
                console.log(`[DEBUG] Markdown H1 ${index + 1}: ${h1.substring(0, 100)}`);
            });
        }

        // レスポンスを返す
        res.status(200).json({
            success: true,
            url: targetUrl,
            content: markdownContent,
            debug: {
                htmlH1Count: h1Matches ? h1Matches.length : 0,
                markdownH1Count: markdownH1Matches ? markdownH1Matches.length : 0
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch content'
        });
    }
}

/**
 * HTMLをMarkdownに変換（簡易版）
 */
function htmlToMarkdown(html) {
    // giftee.bizの記事ページ構造に合わせた抽出
    // 1. まず、記事のメインコンテンツエリアを探す（giftee.bizの構造に合わせる）
    // classに"content"や"article"を含むdivを探す
    let contentMatch = null;
    
    // パターン1: class="article-content"やclass="post-content"など
    const patterns = [
        /<div[^>]*class="[^"]*article[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*post[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*entry[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*column[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];
    
    for (const pattern of patterns) {
        contentMatch = html.match(pattern);
        if (contentMatch) {
            console.log(`[DEBUG] Found content using pattern: ${pattern}`);
            break;
        }
    }
    
    // パターン2: articleタグまたはmainタグの中身を抽出
    if (!contentMatch) {
        contentMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (contentMatch) {
            console.log(`[DEBUG] Found content using <article> tag`);
        }
    }
    if (!contentMatch) {
        contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        if (contentMatch) {
            console.log(`[DEBUG] Found content using <main> tag`);
        }
    }
    
    // パターン3: H1タグを含むセクションを探す（より広範囲に）
    if (!contentMatch) {
        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1Match) {
            const h1Index = html.indexOf(h1Match[0]);
            // H1の前500文字から後10000文字までを抽出
            const start = Math.max(0, h1Index - 500);
            const end = Math.min(html.length, h1Index + 10000);
            contentMatch = [null, html.substring(start, end)];
            console.log(`[DEBUG] Found content using H1-based extraction (${end - start} chars)`);
        }
    }
    
    // パターン4: bodyタグ全体から不要な部分を除外
    if (!contentMatch) {
        // bodyタグを取得
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            let bodyContent = bodyMatch[1];
            // ヘッダー、フッター、サイドバーを削除
            bodyContent = bodyContent.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
            bodyContent = bodyContent.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
            bodyContent = bodyContent.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
            bodyContent = bodyContent.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
            contentMatch = [null, bodyContent];
            console.log(`[DEBUG] Found content using body tag (cleaned)`);
        }
    }
    
    let content = contentMatch ? contentMatch[1] : html;
    
    if (!contentMatch) {
        console.log(`[WARNING] Could not find specific content area, using full HTML`);
    }
    
    // 抽出されたコンテンツ内のH1タグを確認（デバッグ用）
    const extractedH1Matches = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
    console.log(`[DEBUG] Found ${extractedH1Matches ? extractedH1Matches.length : 0} H1 tags in extracted content`);
    if (extractedH1Matches) {
        extractedH1Matches.forEach((h1, index) => {
            const textMatch = h1.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (textMatch) {
                console.log(`[DEBUG] Extracted H1 ${index + 1}: ${textMatch[1].trim().substring(0, 100)}`);
            }
        });
    }

    // スクリプトとスタイルを削除
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // 見出し（最初のH1のみを保持し、2つ目以降はH2に変換）
    let h1Count = 0;
    content = content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (match, text) => {
        h1Count++;
        if (h1Count === 1) {
            return '\n# ' + text.trim() + '\n';
        } else {
            console.log(`[DEBUG] Converting duplicate H1 to H2: ${text.trim().substring(0, 50)}`);
            return '\n## ' + text.trim() + '\n';
        }
    });
    content = content.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    content = content.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    content = content.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

    // 段落
    content = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

    // リスト
    content = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1');
    content = content.replace(/<ul[^>]*>/gi, '');
    content = content.replace(/<\/ul>/gi, '');

    // 改行タグ
    content = content.replace(/<br\s*\/?>/gi, '\n');

    // 太字
    content = content.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    content = content.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');

    // リンク
    content = content.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // 画像
    content = content.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');

    // その他のタグを削除
    content = content.replace(/<[^>]+>/g, '');

    // HTMLエンティティのデコード（簡易）
    content = content.replace(/&nbsp;/g, ' ')
                     .replace(/&amp;/g, '&')
                     .replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/&quot;/g, '"');

    // 連続する空行を整理
    content = content.replace(/\n\s*\n/g, '\n\n');
    
    return content.trim();
}

