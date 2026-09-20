/*
 * Copyright (c) 2026 neohab contributors
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information.
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
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.eclipse.jdt.annotation.NonNullByDefault;
import org.eclipse.jdt.annotation.Nullable;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.http.whiteboard.propertytypes.HttpWhiteboardFilterPattern;

/**
 * Tells browsers how long they may keep each part of the web app. Without it the whiteboard
 * sends no Cache-Control at all, so a returning user kept the old index.html after an upgrade.
 *
 * @author Jon Sands - Initial contribution
 */
@Component(service = Filter.class)
@HttpWhiteboardFilterPattern(NeohabTile.RESOURCE_PATH + "/*")
@NonNullByDefault
public class NeohabCacheFilter implements Filter {

    private static final String REVALIDATE = "no-cache";

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

    // package-private so the rule itself can be tested
    static @Nullable String cacheControlFor(String uri) {
        // a path can carry a query string, so compare on the last segment
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
    public void init(FilterConfig config) throws ServletException {
    }

    @Override
    public void destroy() {
    }
}
