// Private Wayland virtual pointer; never connects outside the fixture runtime.
#include <wayland-client.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "pointer.h"
static struct zwlr_virtual_pointer_manager_v1 *manager;
static void global(void *data, struct wl_registry *registry, uint32_t name,
                   const char *interface, uint32_t version) {
    (void)data; (void)version;
    if (!strcmp(interface, "zwlr_virtual_pointer_manager_v1"))
        manager = wl_registry_bind(registry, name, &zwlr_virtual_pointer_manager_v1_interface, 1);
}
static void removed(void *data, struct wl_registry *registry, uint32_t name) {
    (void)data; (void)registry; (void)name;
}
int main(int argc, char **argv) {
    const char *runtime = getenv("XDG_RUNTIME_DIR");
    if (argc != 3 || !runtime || strncmp(runtime, "/tmp/strand-f-", 14)) return 2;
    struct wl_display *display = wl_display_connect(NULL);
    if (!display) return 3;
    struct wl_registry *registry = wl_display_get_registry(display);
    const struct wl_registry_listener listener = {global, removed};
    wl_registry_add_listener(registry, &listener, NULL);
    wl_display_roundtrip(display);
    if (!manager) return 4;
    struct zwlr_virtual_pointer_v1 *pointer = zwlr_virtual_pointer_manager_v1_create_virtual_pointer(manager, NULL);
    zwlr_virtual_pointer_v1_motion_absolute(pointer, 0, atoi(argv[1]), atoi(argv[2]), 1920, 1080);
    zwlr_virtual_pointer_v1_frame(pointer);
    wl_display_roundtrip(display);
    // Keep the device alive while the owner captures the popout.
    sleep(10);
    wl_display_disconnect(display);
    return 0;
}
