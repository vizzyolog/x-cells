// Generated by the gRPC C++ plugin.
// If you make any local change, they will be lost.
// source: bullet-server/physics.proto
#ifndef GRPC_bullet_2dserver_2fphysics_2eproto__INCLUDED
#define GRPC_bullet_2dserver_2fphysics_2eproto__INCLUDED

#include "physics.pb.h"

#include <functional>
#include <grpcpp/generic/async_generic_service.h>
#include <grpcpp/support/async_stream.h>
#include <grpcpp/support/async_unary_call.h>
#include <grpcpp/support/client_callback.h>
#include <grpcpp/client_context.h>
#include <grpcpp/completion_queue.h>
#include <grpcpp/support/message_allocator.h>
#include <grpcpp/support/method_handler.h>
#include <grpcpp/impl/proto_utils.h>
#include <grpcpp/impl/rpc_method.h>
#include <grpcpp/support/server_callback.h>
#include <grpcpp/impl/server_callback_handlers.h>
#include <grpcpp/server_context.h>
#include <grpcpp/impl/service_type.h>
#include <grpcpp/support/status.h>
#include <grpcpp/support/stub_options.h>
#include <grpcpp/support/sync_stream.h>

namespace physics {

// gRPC-сервис
class Physics final {
 public:
  static constexpr char const* service_full_name() {
    return "physics.Physics";
  }
  class StubInterface {
   public:
    virtual ~StubInterface() {}
    // Применить импульс к шару
    virtual ::grpc::Status ApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::physics::ApplyImpulseResponse* response) = 0;
    std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::ApplyImpulseResponse>> AsyncApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::ApplyImpulseResponse>>(AsyncApplyImpulseRaw(context, request, cq));
    }
    std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::ApplyImpulseResponse>> PrepareAsyncApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::ApplyImpulseResponse>>(PrepareAsyncApplyImpulseRaw(context, request, cq));
    }
    // Запросить текущее состояние (позиция сферы)
    virtual ::grpc::Status GetState(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::physics::GetStateResponse* response) = 0;
    std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::GetStateResponse>> AsyncGetState(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::GetStateResponse>>(AsyncGetStateRaw(context, request, cq));
    }
    std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::GetStateResponse>> PrepareAsyncGetState(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::GetStateResponse>>(PrepareAsyncGetStateRaw(context, request, cq));
    }
    // Шаг симуляции (опционально, если дергаем вручную)
    virtual ::grpc::Status Step(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::physics::StepResponse* response) = 0;
    std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::StepResponse>> AsyncStep(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::StepResponse>>(AsyncStepRaw(context, request, cq));
    }
    std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::StepResponse>> PrepareAsyncStep(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReaderInterface< ::physics::StepResponse>>(PrepareAsyncStepRaw(context, request, cq));
    }
    class async_interface {
     public:
      virtual ~async_interface() {}
      // Применить импульс к шару
      virtual void ApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest* request, ::physics::ApplyImpulseResponse* response, std::function<void(::grpc::Status)>) = 0;
      virtual void ApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest* request, ::physics::ApplyImpulseResponse* response, ::grpc::ClientUnaryReactor* reactor) = 0;
      // Запросить текущее состояние (позиция сферы)
      virtual void GetState(::grpc::ClientContext* context, const ::physics::GetStateRequest* request, ::physics::GetStateResponse* response, std::function<void(::grpc::Status)>) = 0;
      virtual void GetState(::grpc::ClientContext* context, const ::physics::GetStateRequest* request, ::physics::GetStateResponse* response, ::grpc::ClientUnaryReactor* reactor) = 0;
      // Шаг симуляции (опционально, если дергаем вручную)
      virtual void Step(::grpc::ClientContext* context, const ::physics::StepRequest* request, ::physics::StepResponse* response, std::function<void(::grpc::Status)>) = 0;
      virtual void Step(::grpc::ClientContext* context, const ::physics::StepRequest* request, ::physics::StepResponse* response, ::grpc::ClientUnaryReactor* reactor) = 0;
    };
    typedef class async_interface experimental_async_interface;
    virtual class async_interface* async() { return nullptr; }
    class async_interface* experimental_async() { return async(); }
   private:
    virtual ::grpc::ClientAsyncResponseReaderInterface< ::physics::ApplyImpulseResponse>* AsyncApplyImpulseRaw(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) = 0;
    virtual ::grpc::ClientAsyncResponseReaderInterface< ::physics::ApplyImpulseResponse>* PrepareAsyncApplyImpulseRaw(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) = 0;
    virtual ::grpc::ClientAsyncResponseReaderInterface< ::physics::GetStateResponse>* AsyncGetStateRaw(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) = 0;
    virtual ::grpc::ClientAsyncResponseReaderInterface< ::physics::GetStateResponse>* PrepareAsyncGetStateRaw(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) = 0;
    virtual ::grpc::ClientAsyncResponseReaderInterface< ::physics::StepResponse>* AsyncStepRaw(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) = 0;
    virtual ::grpc::ClientAsyncResponseReaderInterface< ::physics::StepResponse>* PrepareAsyncStepRaw(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) = 0;
  };
  class Stub final : public StubInterface {
   public:
    Stub(const std::shared_ptr< ::grpc::ChannelInterface>& channel, const ::grpc::StubOptions& options = ::grpc::StubOptions());
    ::grpc::Status ApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::physics::ApplyImpulseResponse* response) override;
    std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::ApplyImpulseResponse>> AsyncApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::ApplyImpulseResponse>>(AsyncApplyImpulseRaw(context, request, cq));
    }
    std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::ApplyImpulseResponse>> PrepareAsyncApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::ApplyImpulseResponse>>(PrepareAsyncApplyImpulseRaw(context, request, cq));
    }
    ::grpc::Status GetState(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::physics::GetStateResponse* response) override;
    std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::GetStateResponse>> AsyncGetState(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::GetStateResponse>>(AsyncGetStateRaw(context, request, cq));
    }
    std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::GetStateResponse>> PrepareAsyncGetState(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::GetStateResponse>>(PrepareAsyncGetStateRaw(context, request, cq));
    }
    ::grpc::Status Step(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::physics::StepResponse* response) override;
    std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::StepResponse>> AsyncStep(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::StepResponse>>(AsyncStepRaw(context, request, cq));
    }
    std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::StepResponse>> PrepareAsyncStep(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) {
      return std::unique_ptr< ::grpc::ClientAsyncResponseReader< ::physics::StepResponse>>(PrepareAsyncStepRaw(context, request, cq));
    }
    class async final :
      public StubInterface::async_interface {
     public:
      void ApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest* request, ::physics::ApplyImpulseResponse* response, std::function<void(::grpc::Status)>) override;
      void ApplyImpulse(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest* request, ::physics::ApplyImpulseResponse* response, ::grpc::ClientUnaryReactor* reactor) override;
      void GetState(::grpc::ClientContext* context, const ::physics::GetStateRequest* request, ::physics::GetStateResponse* response, std::function<void(::grpc::Status)>) override;
      void GetState(::grpc::ClientContext* context, const ::physics::GetStateRequest* request, ::physics::GetStateResponse* response, ::grpc::ClientUnaryReactor* reactor) override;
      void Step(::grpc::ClientContext* context, const ::physics::StepRequest* request, ::physics::StepResponse* response, std::function<void(::grpc::Status)>) override;
      void Step(::grpc::ClientContext* context, const ::physics::StepRequest* request, ::physics::StepResponse* response, ::grpc::ClientUnaryReactor* reactor) override;
     private:
      friend class Stub;
      explicit async(Stub* stub): stub_(stub) { }
      Stub* stub() { return stub_; }
      Stub* stub_;
    };
    class async* async() override { return &async_stub_; }

   private:
    std::shared_ptr< ::grpc::ChannelInterface> channel_;
    class async async_stub_{this};
    ::grpc::ClientAsyncResponseReader< ::physics::ApplyImpulseResponse>* AsyncApplyImpulseRaw(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) override;
    ::grpc::ClientAsyncResponseReader< ::physics::ApplyImpulseResponse>* PrepareAsyncApplyImpulseRaw(::grpc::ClientContext* context, const ::physics::ApplyImpulseRequest& request, ::grpc::CompletionQueue* cq) override;
    ::grpc::ClientAsyncResponseReader< ::physics::GetStateResponse>* AsyncGetStateRaw(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) override;
    ::grpc::ClientAsyncResponseReader< ::physics::GetStateResponse>* PrepareAsyncGetStateRaw(::grpc::ClientContext* context, const ::physics::GetStateRequest& request, ::grpc::CompletionQueue* cq) override;
    ::grpc::ClientAsyncResponseReader< ::physics::StepResponse>* AsyncStepRaw(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) override;
    ::grpc::ClientAsyncResponseReader< ::physics::StepResponse>* PrepareAsyncStepRaw(::grpc::ClientContext* context, const ::physics::StepRequest& request, ::grpc::CompletionQueue* cq) override;
    const ::grpc::internal::RpcMethod rpcmethod_ApplyImpulse_;
    const ::grpc::internal::RpcMethod rpcmethod_GetState_;
    const ::grpc::internal::RpcMethod rpcmethod_Step_;
  };
  static std::unique_ptr<Stub> NewStub(const std::shared_ptr< ::grpc::ChannelInterface>& channel, const ::grpc::StubOptions& options = ::grpc::StubOptions());

  class Service : public ::grpc::Service {
   public:
    Service();
    virtual ~Service();
    // Применить импульс к шару
    virtual ::grpc::Status ApplyImpulse(::grpc::ServerContext* context, const ::physics::ApplyImpulseRequest* request, ::physics::ApplyImpulseResponse* response);
    // Запросить текущее состояние (позиция сферы)
    virtual ::grpc::Status GetState(::grpc::ServerContext* context, const ::physics::GetStateRequest* request, ::physics::GetStateResponse* response);
    // Шаг симуляции (опционально, если дергаем вручную)
    virtual ::grpc::Status Step(::grpc::ServerContext* context, const ::physics::StepRequest* request, ::physics::StepResponse* response);
  };
  template <class BaseClass>
  class WithAsyncMethod_ApplyImpulse : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithAsyncMethod_ApplyImpulse() {
      ::grpc::Service::MarkMethodAsync(0);
    }
    ~WithAsyncMethod_ApplyImpulse() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status ApplyImpulse(::grpc::ServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    void RequestApplyImpulse(::grpc::ServerContext* context, ::physics::ApplyImpulseRequest* request, ::grpc::ServerAsyncResponseWriter< ::physics::ApplyImpulseResponse>* response, ::grpc::CompletionQueue* new_call_cq, ::grpc::ServerCompletionQueue* notification_cq, void *tag) {
      ::grpc::Service::RequestAsyncUnary(0, context, request, response, new_call_cq, notification_cq, tag);
    }
  };
  template <class BaseClass>
  class WithAsyncMethod_GetState : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithAsyncMethod_GetState() {
      ::grpc::Service::MarkMethodAsync(1);
    }
    ~WithAsyncMethod_GetState() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status GetState(::grpc::ServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    void RequestGetState(::grpc::ServerContext* context, ::physics::GetStateRequest* request, ::grpc::ServerAsyncResponseWriter< ::physics::GetStateResponse>* response, ::grpc::CompletionQueue* new_call_cq, ::grpc::ServerCompletionQueue* notification_cq, void *tag) {
      ::grpc::Service::RequestAsyncUnary(1, context, request, response, new_call_cq, notification_cq, tag);
    }
  };
  template <class BaseClass>
  class WithAsyncMethod_Step : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithAsyncMethod_Step() {
      ::grpc::Service::MarkMethodAsync(2);
    }
    ~WithAsyncMethod_Step() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status Step(::grpc::ServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    void RequestStep(::grpc::ServerContext* context, ::physics::StepRequest* request, ::grpc::ServerAsyncResponseWriter< ::physics::StepResponse>* response, ::grpc::CompletionQueue* new_call_cq, ::grpc::ServerCompletionQueue* notification_cq, void *tag) {
      ::grpc::Service::RequestAsyncUnary(2, context, request, response, new_call_cq, notification_cq, tag);
    }
  };
  typedef WithAsyncMethod_ApplyImpulse<WithAsyncMethod_GetState<WithAsyncMethod_Step<Service > > > AsyncService;
  template <class BaseClass>
  class WithCallbackMethod_ApplyImpulse : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithCallbackMethod_ApplyImpulse() {
      ::grpc::Service::MarkMethodCallback(0,
          new ::grpc::internal::CallbackUnaryHandler< ::physics::ApplyImpulseRequest, ::physics::ApplyImpulseResponse>(
            [this](
                   ::grpc::CallbackServerContext* context, const ::physics::ApplyImpulseRequest* request, ::physics::ApplyImpulseResponse* response) { return this->ApplyImpulse(context, request, response); }));}
    void SetMessageAllocatorFor_ApplyImpulse(
        ::grpc::MessageAllocator< ::physics::ApplyImpulseRequest, ::physics::ApplyImpulseResponse>* allocator) {
      ::grpc::internal::MethodHandler* const handler = ::grpc::Service::GetHandler(0);
      static_cast<::grpc::internal::CallbackUnaryHandler< ::physics::ApplyImpulseRequest, ::physics::ApplyImpulseResponse>*>(handler)
              ->SetMessageAllocator(allocator);
    }
    ~WithCallbackMethod_ApplyImpulse() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status ApplyImpulse(::grpc::ServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    virtual ::grpc::ServerUnaryReactor* ApplyImpulse(
      ::grpc::CallbackServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/)  { return nullptr; }
  };
  template <class BaseClass>
  class WithCallbackMethod_GetState : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithCallbackMethod_GetState() {
      ::grpc::Service::MarkMethodCallback(1,
          new ::grpc::internal::CallbackUnaryHandler< ::physics::GetStateRequest, ::physics::GetStateResponse>(
            [this](
                   ::grpc::CallbackServerContext* context, const ::physics::GetStateRequest* request, ::physics::GetStateResponse* response) { return this->GetState(context, request, response); }));}
    void SetMessageAllocatorFor_GetState(
        ::grpc::MessageAllocator< ::physics::GetStateRequest, ::physics::GetStateResponse>* allocator) {
      ::grpc::internal::MethodHandler* const handler = ::grpc::Service::GetHandler(1);
      static_cast<::grpc::internal::CallbackUnaryHandler< ::physics::GetStateRequest, ::physics::GetStateResponse>*>(handler)
              ->SetMessageAllocator(allocator);
    }
    ~WithCallbackMethod_GetState() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status GetState(::grpc::ServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    virtual ::grpc::ServerUnaryReactor* GetState(
      ::grpc::CallbackServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/)  { return nullptr; }
  };
  template <class BaseClass>
  class WithCallbackMethod_Step : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithCallbackMethod_Step() {
      ::grpc::Service::MarkMethodCallback(2,
          new ::grpc::internal::CallbackUnaryHandler< ::physics::StepRequest, ::physics::StepResponse>(
            [this](
                   ::grpc::CallbackServerContext* context, const ::physics::StepRequest* request, ::physics::StepResponse* response) { return this->Step(context, request, response); }));}
    void SetMessageAllocatorFor_Step(
        ::grpc::MessageAllocator< ::physics::StepRequest, ::physics::StepResponse>* allocator) {
      ::grpc::internal::MethodHandler* const handler = ::grpc::Service::GetHandler(2);
      static_cast<::grpc::internal::CallbackUnaryHandler< ::physics::StepRequest, ::physics::StepResponse>*>(handler)
              ->SetMessageAllocator(allocator);
    }
    ~WithCallbackMethod_Step() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status Step(::grpc::ServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    virtual ::grpc::ServerUnaryReactor* Step(
      ::grpc::CallbackServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/)  { return nullptr; }
  };
  typedef WithCallbackMethod_ApplyImpulse<WithCallbackMethod_GetState<WithCallbackMethod_Step<Service > > > CallbackService;
  typedef CallbackService ExperimentalCallbackService;
  template <class BaseClass>
  class WithGenericMethod_ApplyImpulse : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithGenericMethod_ApplyImpulse() {
      ::grpc::Service::MarkMethodGeneric(0);
    }
    ~WithGenericMethod_ApplyImpulse() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status ApplyImpulse(::grpc::ServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
  };
  template <class BaseClass>
  class WithGenericMethod_GetState : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithGenericMethod_GetState() {
      ::grpc::Service::MarkMethodGeneric(1);
    }
    ~WithGenericMethod_GetState() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status GetState(::grpc::ServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
  };
  template <class BaseClass>
  class WithGenericMethod_Step : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithGenericMethod_Step() {
      ::grpc::Service::MarkMethodGeneric(2);
    }
    ~WithGenericMethod_Step() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status Step(::grpc::ServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
  };
  template <class BaseClass>
  class WithRawMethod_ApplyImpulse : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithRawMethod_ApplyImpulse() {
      ::grpc::Service::MarkMethodRaw(0);
    }
    ~WithRawMethod_ApplyImpulse() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status ApplyImpulse(::grpc::ServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    void RequestApplyImpulse(::grpc::ServerContext* context, ::grpc::ByteBuffer* request, ::grpc::ServerAsyncResponseWriter< ::grpc::ByteBuffer>* response, ::grpc::CompletionQueue* new_call_cq, ::grpc::ServerCompletionQueue* notification_cq, void *tag) {
      ::grpc::Service::RequestAsyncUnary(0, context, request, response, new_call_cq, notification_cq, tag);
    }
  };
  template <class BaseClass>
  class WithRawMethod_GetState : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithRawMethod_GetState() {
      ::grpc::Service::MarkMethodRaw(1);
    }
    ~WithRawMethod_GetState() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status GetState(::grpc::ServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    void RequestGetState(::grpc::ServerContext* context, ::grpc::ByteBuffer* request, ::grpc::ServerAsyncResponseWriter< ::grpc::ByteBuffer>* response, ::grpc::CompletionQueue* new_call_cq, ::grpc::ServerCompletionQueue* notification_cq, void *tag) {
      ::grpc::Service::RequestAsyncUnary(1, context, request, response, new_call_cq, notification_cq, tag);
    }
  };
  template <class BaseClass>
  class WithRawMethod_Step : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithRawMethod_Step() {
      ::grpc::Service::MarkMethodRaw(2);
    }
    ~WithRawMethod_Step() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status Step(::grpc::ServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    void RequestStep(::grpc::ServerContext* context, ::grpc::ByteBuffer* request, ::grpc::ServerAsyncResponseWriter< ::grpc::ByteBuffer>* response, ::grpc::CompletionQueue* new_call_cq, ::grpc::ServerCompletionQueue* notification_cq, void *tag) {
      ::grpc::Service::RequestAsyncUnary(2, context, request, response, new_call_cq, notification_cq, tag);
    }
  };
  template <class BaseClass>
  class WithRawCallbackMethod_ApplyImpulse : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithRawCallbackMethod_ApplyImpulse() {
      ::grpc::Service::MarkMethodRawCallback(0,
          new ::grpc::internal::CallbackUnaryHandler< ::grpc::ByteBuffer, ::grpc::ByteBuffer>(
            [this](
                   ::grpc::CallbackServerContext* context, const ::grpc::ByteBuffer* request, ::grpc::ByteBuffer* response) { return this->ApplyImpulse(context, request, response); }));
    }
    ~WithRawCallbackMethod_ApplyImpulse() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status ApplyImpulse(::grpc::ServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    virtual ::grpc::ServerUnaryReactor* ApplyImpulse(
      ::grpc::CallbackServerContext* /*context*/, const ::grpc::ByteBuffer* /*request*/, ::grpc::ByteBuffer* /*response*/)  { return nullptr; }
  };
  template <class BaseClass>
  class WithRawCallbackMethod_GetState : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithRawCallbackMethod_GetState() {
      ::grpc::Service::MarkMethodRawCallback(1,
          new ::grpc::internal::CallbackUnaryHandler< ::grpc::ByteBuffer, ::grpc::ByteBuffer>(
            [this](
                   ::grpc::CallbackServerContext* context, const ::grpc::ByteBuffer* request, ::grpc::ByteBuffer* response) { return this->GetState(context, request, response); }));
    }
    ~WithRawCallbackMethod_GetState() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status GetState(::grpc::ServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    virtual ::grpc::ServerUnaryReactor* GetState(
      ::grpc::CallbackServerContext* /*context*/, const ::grpc::ByteBuffer* /*request*/, ::grpc::ByteBuffer* /*response*/)  { return nullptr; }
  };
  template <class BaseClass>
  class WithRawCallbackMethod_Step : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithRawCallbackMethod_Step() {
      ::grpc::Service::MarkMethodRawCallback(2,
          new ::grpc::internal::CallbackUnaryHandler< ::grpc::ByteBuffer, ::grpc::ByteBuffer>(
            [this](
                   ::grpc::CallbackServerContext* context, const ::grpc::ByteBuffer* request, ::grpc::ByteBuffer* response) { return this->Step(context, request, response); }));
    }
    ~WithRawCallbackMethod_Step() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable synchronous version of this method
    ::grpc::Status Step(::grpc::ServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    virtual ::grpc::ServerUnaryReactor* Step(
      ::grpc::CallbackServerContext* /*context*/, const ::grpc::ByteBuffer* /*request*/, ::grpc::ByteBuffer* /*response*/)  { return nullptr; }
  };
  template <class BaseClass>
  class WithStreamedUnaryMethod_ApplyImpulse : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithStreamedUnaryMethod_ApplyImpulse() {
      ::grpc::Service::MarkMethodStreamed(0,
        new ::grpc::internal::StreamedUnaryHandler<
          ::physics::ApplyImpulseRequest, ::physics::ApplyImpulseResponse>(
            [this](::grpc::ServerContext* context,
                   ::grpc::ServerUnaryStreamer<
                     ::physics::ApplyImpulseRequest, ::physics::ApplyImpulseResponse>* streamer) {
                       return this->StreamedApplyImpulse(context,
                         streamer);
                  }));
    }
    ~WithStreamedUnaryMethod_ApplyImpulse() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable regular version of this method
    ::grpc::Status ApplyImpulse(::grpc::ServerContext* /*context*/, const ::physics::ApplyImpulseRequest* /*request*/, ::physics::ApplyImpulseResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    // replace default version of method with streamed unary
    virtual ::grpc::Status StreamedApplyImpulse(::grpc::ServerContext* context, ::grpc::ServerUnaryStreamer< ::physics::ApplyImpulseRequest,::physics::ApplyImpulseResponse>* server_unary_streamer) = 0;
  };
  template <class BaseClass>
  class WithStreamedUnaryMethod_GetState : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithStreamedUnaryMethod_GetState() {
      ::grpc::Service::MarkMethodStreamed(1,
        new ::grpc::internal::StreamedUnaryHandler<
          ::physics::GetStateRequest, ::physics::GetStateResponse>(
            [this](::grpc::ServerContext* context,
                   ::grpc::ServerUnaryStreamer<
                     ::physics::GetStateRequest, ::physics::GetStateResponse>* streamer) {
                       return this->StreamedGetState(context,
                         streamer);
                  }));
    }
    ~WithStreamedUnaryMethod_GetState() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable regular version of this method
    ::grpc::Status GetState(::grpc::ServerContext* /*context*/, const ::physics::GetStateRequest* /*request*/, ::physics::GetStateResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    // replace default version of method with streamed unary
    virtual ::grpc::Status StreamedGetState(::grpc::ServerContext* context, ::grpc::ServerUnaryStreamer< ::physics::GetStateRequest,::physics::GetStateResponse>* server_unary_streamer) = 0;
  };
  template <class BaseClass>
  class WithStreamedUnaryMethod_Step : public BaseClass {
   private:
    void BaseClassMustBeDerivedFromService(const Service* /*service*/) {}
   public:
    WithStreamedUnaryMethod_Step() {
      ::grpc::Service::MarkMethodStreamed(2,
        new ::grpc::internal::StreamedUnaryHandler<
          ::physics::StepRequest, ::physics::StepResponse>(
            [this](::grpc::ServerContext* context,
                   ::grpc::ServerUnaryStreamer<
                     ::physics::StepRequest, ::physics::StepResponse>* streamer) {
                       return this->StreamedStep(context,
                         streamer);
                  }));
    }
    ~WithStreamedUnaryMethod_Step() override {
      BaseClassMustBeDerivedFromService(this);
    }
    // disable regular version of this method
    ::grpc::Status Step(::grpc::ServerContext* /*context*/, const ::physics::StepRequest* /*request*/, ::physics::StepResponse* /*response*/) override {
      abort();
      return ::grpc::Status(::grpc::StatusCode::UNIMPLEMENTED, "");
    }
    // replace default version of method with streamed unary
    virtual ::grpc::Status StreamedStep(::grpc::ServerContext* context, ::grpc::ServerUnaryStreamer< ::physics::StepRequest,::physics::StepResponse>* server_unary_streamer) = 0;
  };
  typedef WithStreamedUnaryMethod_ApplyImpulse<WithStreamedUnaryMethod_GetState<WithStreamedUnaryMethod_Step<Service > > > StreamedUnaryService;
  typedef Service SplitStreamedService;
  typedef WithStreamedUnaryMethod_ApplyImpulse<WithStreamedUnaryMethod_GetState<WithStreamedUnaryMethod_Step<Service > > > StreamedService;
};

}  // namespace physics


#endif  // GRPC_bullet_2dserver_2fphysics_2eproto__INCLUDED