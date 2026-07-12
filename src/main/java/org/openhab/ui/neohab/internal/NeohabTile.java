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

import org.eclipse.jdt.annotation.NonNullByDefault;
import org.eclipse.jdt.annotation.Nullable;
import org.openhab.core.ui.tiles.Tile;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Deactivate;
import org.osgi.service.http.whiteboard.propertytypes.HttpWhiteboardResource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Registers the neohab start page tile and serves the bundled web app.
 *
 * @author Jon Sands - Initial contribution
 */
@Component(service = Tile.class, immediate = true)
@HttpWhiteboardResource(pattern = NeohabTile.RESOURCE_PATH + "/*", prefix = "/web")
@NonNullByDefault
public class NeohabTile implements Tile {

    public static final String RESOURCE_PATH = "/neohab";

    private final Logger logger = LoggerFactory.getLogger(NeohabTile.class);

    @Activate
    public NeohabTile() {
        logger.info("Started neohab at {}", RESOURCE_PATH);
    }

    @Deactivate
    protected void deactivate() {
        logger.info("Stopped neohab");
    }

    @Override
    public String getName() {
        return "neohab";
    }

    @Override
    public String getUrl() {
        return RESOURCE_PATH + "/index.html";
    }

    @Override
    public @Nullable String getOverlay() {
        return null;
    }

    @Override
    public String getImageUrl() {
        return RESOURCE_PATH + "/tile.png";
    }
}
