// libmpv drawing under the app's web view, in the same window. The page shows
// through where it is transparent, so the player's own controls sit over the
// video. Called from the Bun shell through bun:ffi; every AppKit call hops to
// the main thread, libmpv's client API is thread-safe.
//
// Nothing the shell calls waits on mpv's core: a synchronous get or set queues
// behind the core, which spends each frame waiting for the main thread to draw,
// so polling that way made every click wait seconds. Properties are observed
// (their changes land in the event queue, drained without the core) and every
// set and command is async.

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
// The observed properties' latest values, as mpv reported them.
@property(nonatomic, strong) NSMutableDictionary<NSString *, id> *values;
@end

static const struct {
  const char *name;
  mpv_format format;
} OBSERVED[] = {
    {"time-pos", MPV_FORMAT_DOUBLE},       {"duration", MPV_FORMAT_DOUBLE},
    {"volume", MPV_FORMAT_DOUBLE},         {"pause", MPV_FORMAT_FLAG},
    {"paused-for-cache", MPV_FORMAT_FLAG}, {"seeking", MPV_FORMAT_FLAG},
    {"eof-reached", MPV_FORMAT_FLAG},      {"mute", MPV_FORMAT_FLAG},
    {"track-list", MPV_FORMAT_STRING},
};

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
    player.values = [NSMutableDictionary dictionary];
    for (size_t index = 0; index < sizeof OBSERVED / sizeof OBSERVED[0];
         index++) {
      mpv_observe_property(mpv, 0, OBSERVED[index].name,
                           OBSERVED[index].format);
    }
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
  const char *start_value = position;
  mpv_set_property_async(player.mpv, 0, "start", MPV_FORMAT_STRING,
                         &start_value);
  const char *command[] = {"loadfile", url, "replace", NULL};
  return mpv_command_async(player.mpv, 0, command);
}

// Queued, in order with every other set and command: mpv copies the value.
int nuvio_mpv_set(void *pointer, const char *name, const char *value) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  return mpv_set_property_async(player.mpv, 0, name, MPV_FORMAT_STRING, &value);
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
  int result = mpv_command_async(player.mpv, 0, args);
  free(copy);
  return result;
}

static id observed(void *pointer, const char *name) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  return player.values[[NSString stringWithUTF8String:name]];
}

// An observed numeric property, or NaN while it has no value.
double nuvio_mpv_get_double(void *pointer, const char *name) {
  id value = observed(pointer, name);
  return [value isKindOfClass:[NSNumber class]] ? [value doubleValue] : NAN;
}

// A property as text (a node property, like track-list, as JSON) copied into
// `out`: its full length, so a caller whose buffer was too small can retry, or
// -1 while it has no value.
int nuvio_mpv_get_string(void *pointer, const char *name, char *out, int size) {
  id value = observed(pointer, name);
  if (![value isKindOfClass:[NSString class]]) {
    return -1;
  }
  const char *text = [value UTF8String];
  int length = (int)strlen(text);
  if (size > 0) {
    snprintf(out, (size_t)size, "%s", text);
  }
  return length;
}

// An observed flag property: 1, 0, or -1 while it has no value.
int nuvio_mpv_get_flag(void *pointer, const char *name) {
  id value = observed(pointer, name);
  return [value isKindOfClass:[NSNumber class]] ? [value intValue] : -1;
}

static void remember(NuvioMpvPlayer *player, mpv_event_property *property) {
  NSString *name = [NSString stringWithUTF8String:property->name];
  if (property->format == MPV_FORMAT_DOUBLE) {
    player.values[name] = @(*(double *)property->data);
  } else if (property->format == MPV_FORMAT_FLAG) {
    player.values[name] = @(*(int *)property->data);
  } else if (property->format == MPV_FORMAT_STRING) {
    player.values[name] = [NSString stringWithUTF8String:*(char **)property->data];
  } else {
    [player.values removeObjectForKey:name];
  }
}

// Drains mpv's event queue, keeping the observed properties' new values: -1
// when a file failed to load or play, 1 when one ended normally, 0 otherwise.
// Called on every poll, before the getters, so the queue never fills.
int nuvio_mpv_poll_end(void *pointer) {
  NuvioMpvPlayer *player = (__bridge NuvioMpvPlayer *)pointer;
  int outcome = 0;
  for (;;) {
    mpv_event *event = mpv_wait_event(player.mpv, 0);
    if (event->event_id == MPV_EVENT_NONE) {
      break;
    }
    if (event->event_id == MPV_EVENT_PROPERTY_CHANGE) {
      remember(player, (mpv_event_property *)event->data);
    } else if (event->event_id == MPV_EVENT_END_FILE) {
      mpv_event_end_file *end = (mpv_event_end_file *)event->data;
      if (end->reason == MPV_END_FILE_REASON_ERROR) {
        outcome = -1;
      } else if (end->reason == MPV_END_FILE_REASON_EOF && outcome == 0) {
        outcome = 1;
      }
    }
  }
  return outcome;
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
