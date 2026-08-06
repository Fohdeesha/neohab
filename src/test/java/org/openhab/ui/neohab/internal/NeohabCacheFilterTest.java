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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/**
 * Which parts of the app a browser may keep.
 *
 * Getting this wrong is not visible in a browser that has never seen the app before, which is
 * exactly why it went unnoticed: only a returning user, after an upgrade, is served the stale
 * entry point that names a bundle from the previous build.
 *
 * @author Jon Sands - Initial contribution
 */
public class NeohabCacheFilterTest {

    @Test
    public void entryPointsAreRevalidated() {
        // The bare path, the entry point itself, and the two files the installable app boots from.
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/"));
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/index.html"));
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/manifest.json"));
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/sw.js"));
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/registerSW.js"));
    }

    @Test
    public void aQueryStringDoesNotHideTheEntryPoint() {
        // The kiosk and theme escape hatches are both query parameters on index.html.
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/index.html?kiosk=on"));
        assertEquals("no-cache", NeohabCacheFilter.cacheControlFor("/neohab/?theme=none"));
    }

    @Test
    public void hashedAssetsAreImmutable() {
        String expected = "public, max-age=31536000, immutable";
        assertEquals(expected, NeohabCacheFilter.cacheControlFor("/neohab/assets/index-BX5frEMR.js"));
        assertEquals(expected, NeohabCacheFilter.cacheControlFor("/neohab/assets/index-abc123.css"));
        // Behind a reverse proxy that mounts openHAB under a sub-path.
        assertEquals(expected, NeohabCacheFilter.cacheControlFor("/openhab/neohab/assets/plot-xyz.js"));
    }

    @Test
    public void everythingElseKeepsWhateverTheServerSaid() {
        // Icons, fonts and the bundled documentation change only when the add-on does, so the
        // browser's own heuristics are fine and an explicit long cache would only make them
        // stale across an upgrade.
        assertNull(NeohabCacheFilter.cacheControlFor("/neohab/icons/mdi/sofa.svg"));
        assertNull(NeohabCacheFilter.cacheControlFor("/neohab/fonts/poppins-400.woff2"));
        assertNull(NeohabCacheFilter.cacheControlFor("/neohab/docs/theming.html"));
        assertNull(NeohabCacheFilter.cacheControlFor("/neohab/tile.png"));
    }
}
