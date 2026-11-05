// libmpv drawing under the app's web view, in the same window. The page shows
// through where it is transparent, so the player's own controls sit over the
// video. Called from the Bun shell through bun:ffi; every AppKit call hops to
// the main thread, libmpv's client API is thread-safe.

#import <Cocoa/Cocoa.h>
#import <OpenGL/gl3.h>
#include <math.h>
#include <mpv/client.h>
#include <mpv/render_gl.h>

static void *get_proc_address(void *ctx, const char *name) {
  CFStringRef symbol =
      CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingASCII);
  void *address = CFBundleGetFunctionPointerForName(
      CFBundleGetBundleWithIdentifier(CFSTR("com.apple.opengl")), symbol);
  CFRelease(symbol);
  return address;
}

static void on_main(dispatch_block_t block) {
  if ([NSThread isMainThread]) {
    block();
  } else {
    dispatch_sync(dispatch_get_main_queue(), block);
  }
}

@interface NuvioMpvView : NSOpenGLView
@property(nonatomic) mpv_render_context *render;
@end

@implementation NuvioMpvView
- (instancetype)initWithFrame:(NSRect)frame {
  NSOpenGLPixelFormatAttribute attributes[] = {
      NSOpenGLPFADoubleBuffer, NSOpenGLPFAAccelerated, NSOpenGLPFAOpenGLProfile,
      NSOpenGLProfileVersion3_2Core, 0};
  NSOpenGLPixelFormat *format =
      [[NSOpenGLPixelFormat alloc] initWithAttributes:attributes];
  self = [super initWithFrame:frame pixelFormat:format];
  if (self) {
    [self setWantsBestResolutionOpenGLSurface:YES];
    GLint swap = 1;
    [[self openGLContext] setValues:&swap
                       forParameter:NSOpenGLContextParameterSwapInterval];
  }
  return self;
}

// The web view above handles every click and key.
- (NSView *)hitTest:(NSPoint)point {
  return nil;
}

- (void)drawRect:(NSRect)dirty {
  [[self openGLContext] makeCurrentContext];
  NSRect backing = [self convertRectToBacking:[self bounds]];
  if (self.render) {
    mpv_opengl_fbo fbo = {.fbo = 0,
                          .w = (int)backing.size.width,
                          .h = (int)backing.size.height};
    int flip = 1;
    mpv_render_param params[] = {{MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
                                 {MPV_RENDER_PARAM_FLIP_Y, &flip},
                                 {0}};
    mpv_render_context_render(self.render, params);
  } else {
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
  }
  [[self openGLContext] flushBuffer];
}
@end

@interface NuvioMpvPlayer : NSObject
@property(nonatomic) mpv_handle *mpv;
@property(nonatomic, strong) NuvioMpvView *view;
@end

@implementation NuvioMpvPlayer
@end

static void on_render_update(void *context) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)context;
  dispatch_async(dispatch_get_main_queue(), ^{
    NuvioMpvView *view = player.view;
    if (view.render &&
        (mpv_render_context_update(view.render) & MPV_RENDER_UPDATE_FRAME)) {
      [view setNeedsDisplay:YES];
    }
  });
}

// A player under the content of `window_pointer` (an NSWindow), hidden until
// shown. NULL when anything fails.
void *nuvio_mpv_create(void *window_pointer) {
  __block NuvioMpvPlayer *player = nil;
  on_main(^{
    id object = (__bridge id)window_pointer;
    if (![object isKindOfClass:[NSWindow class]]) {
      return;
    }
    NSWindow *window = (NSWindow *)object;
    NSView *content = window.contentView;

    mpv_handle *mpv = mpv_create();
    if (!mpv) {
      return;
    }
    mpv_set_option_string(mpv, "vo", "libmpv");
    mpv_set_option_string(mpv, "hwdec", "videotoolbox");
    mpv_set_option_string(mpv, "idle", "yes");
    mpv_set_option_string(mpv, "keep-open", "yes");
    mpv_set_option_string(mpv, "input-default-bindings", "no");
    mpv_set_option_string(mpv, "osc", "no");
    mpv_set_option_string(mpv, "terminal", "no");
    mpv_set_option_string(mpv, "ytdl", "no");
    mpv_set_option_string(mpv, "sub-auto", "no");
    if (mpv_initialize(mpv) < 0) {
      mpv_terminate_destroy(mpv);
      return;
    }

    NuvioMpvView *view = [[NuvioMpvView alloc] initWithFrame:content.bounds];
    view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    view.hidden = YES;
    [content addSubview:view positioned:NSWindowBelow relativeTo:nil];
    [[view openGLContext] makeCurrentContext];

    mpv_opengl_init_params gl = {.get_proc_address = get_proc_address};
    int advanced = 1;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, (void *)MPV_RENDER_API_TYPE_OPENGL},
        {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl},
        {MPV_RENDER_PARAM_ADVANCED_CONTROL, &advanced},
        {0}};
    mpv_render_context *render = NULL;
    if (mpv_render_context_create(&render, mpv, params) < 0) {
      [view removeFromSuperview];
      mpv_terminate_destroy(mpv);
      return;
    }
    view.render = render;

    player = [[NuvioMpvPlayer alloc] init];
    player.mpv = mpv;
    player.view = view;
    mpv_render_context_set_update_callback(render, on_render_update,
                                           (__bridge void *)player);
  });
  return player ? (__bridge_retained void *)player : NULL;
}

// Opens `url` at `start` seconds, replacing whatever played.
int nuvio_mpv_load(void *pointer, const char *url, double start) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  char position[32];
  snprintf(position, sizeof position, "%.3f", start > 0 ? start : 0);
  mpv_set_property_string(player.mpv, "start", position);
  const char *command[] = {"loadfile", url, "replace", NULL};
  return mpv_command(player.mpv, command);
}

int nuvio_mpv_set(void *pointer, const char *name, const char *value) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  return mpv_set_property_string(player.mpv, name, value);
}

// One mpv command, its arguments separated by '\n' (a seek: "seek\n42\nabsolute").
int nuvio_mpv_command(void *pointer, const char *joined) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  char *copy = strdup(joined);
  const char *args[16] = {0};
  int count = 0;
  char *rest = copy;
  char *token;
  while ((token = strsep(&rest, "\n")) && count < 15) {
    args[count++] = token;
  }
  int result = mpv_command(player.mpv, args);
  free(copy);
  return result;
}

// A numeric property, or NaN while it has no value.
double nuvio_mpv_get_double(void *pointer, const char *name) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  double value = NAN;
  if (mpv_get_property(player.mpv, name, MPV_FORMAT_DOUBLE, &value) < 0) {
    return NAN;
  }
  return value;
}

// A flag property: 1, 0, or -1 while it has no value.
int nuvio_mpv_get_flag(void *pointer, const char *name) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  int value = 0;
  if (mpv_get_property(player.mpv, name, MPV_FORMAT_FLAG, &value) < 0) {
    return -1;
  }
  return value;
}

void nuvio_mpv_set_visible(void *pointer, int visible) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  on_main(^{
    player.view.hidden = !visible;
  });
}

void nuvio_mpv_destroy(void *pointer) {
  NuvioMpvPlayer *player = (__bridge_transfer NuvioMpvPlayer *)pointer;
  on_main(^{
    [[player.view openGLContext] makeCurrentContext];
    mpv_render_context_free(player.view.render);
    player.view.render = NULL;
    [player.view removeFromSuperview];
  });
  mpv_terminate_destroy(player.mpv);
}
