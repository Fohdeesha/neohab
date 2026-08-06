/*
 * Copyright (c) 2026 neohab contributors
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
 */
package org.openhab.ui.neohab.internal;

import java.io.IOException;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.eclipse.jdt.annotation.NonNullByDefault;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.http.whiteboard.propertytypes.HttpWhiteboardFilterPattern;

/**
 * Tells browsers how long they may keep each part of the web app.
 *
 * Static resources are served by the HTTP whiteboard, which answers with an ETag and a
 * Last-Modified but no Cache-Control at all. A browser is then free to apply "heuristic
 * freshness" and reuse what it has without asking - so after dropping a new add-on jar into
 * {@code addons/}, a returning user kept getting the OLD {@code index.html}, which names the
 * previous build's content-hashed bundle, which was also still cached. The upgrade appeared to
 * do nothing until a hard refresh, which is not something a user should have to know about.
 *
 * Two rules, which is all it takes:
 *
 * <ul>
 * <li><b>The entry points</b> ({@code index.html}, the web manifest, the service worker) must be
 * revalidated every time. {@code no-cache} does not mean "do not store" - the browser still
 * caches them and still sends the ETag, so the usual answer is a 304 with no body. The cost is
 * one conditional request; the benefit is that a new build is picked up immediately.</li>
 * <li><b>Everything under {@code assets/}</b> carries a content hash in its file name, so a
 * given URL can never change meaning. Those are marked immutable for a year, which is what the
 * hashing is for and is strictly better than the heuristic guess they were getting.</li>
 * </ul>
 *
 * Anything else (icons, fonts, the bundled documentation) is left alone deliberately: the
 * browser's own heuristics are fine for files that change only when the add-on does, and a
 * long explicit cache would make them stale across an upgrade for no gain.
 *
 * @author Jon Sands - Initial contribution
 */
@Component(service = Filter.class)
@HttpWhiteboardFilterPattern(NeohabTile.RESOURCE_PATH + "/*")
@NonNullByDefault
public class NeohabCacheFilter implements Filter {

    /** Revalidate every time: cheap (a 304), and the only way an upgrade is noticed at once. */
    private static final String REVALIDATE = "no-cache";

    /** Content-hashed file names can never change meaning, so they never need revalidating. */
    private static final String IMMUTABLE = "public, max-age=31536000, immutable";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request instanceof HttpServletRequest && response instanceof HttpServletResponse) {
            String cacheControl = cacheControlFor(((HttpServletRequest) request).getRequestURI());
            if (cacheControl != null) {
                ((HttpServletResponse) response).setHeader("Cache-Control", cacheControl);
            }
        }
        chain.doFilter(request, response);
    }

    /**
     * The Cache-Control for one request path, or null to leave the response as it is.
     *
     * Package-private rather than private so the rule can be exercised directly; it is the part
     * with the decisions in it, and the rest of this class is plumbing.
     */
    static String cacheControlFor(String uri) {
        // A path can carry a query string and can be requested with or without the trailing
        // file name, so compare on the last segment rather than on the whole thing.
        String path = uri;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        if (path.endsWith("/") || path.endsWith("/index.html") || path.endsWith("/manifest.json")
                || path.endsWith("/sw.js") || path.endsWith("/registerSW.js")) {
            return REVALIDATE;
        }
        if (path.contains(NeohabTile.RESOURCE_PATH + "/assets/")) {
            return IMMUTABLE;
        }
        return null;
    }

    @Override
    public void init(javax.servlet.FilterConfig config) throws ServletException {
    }

    @Override
    public void destroy() {
    }
}
