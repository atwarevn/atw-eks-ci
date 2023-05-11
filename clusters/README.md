**Install Flux**
```shell
brew install fluxcd/tap/flux
```
**Set permission to access Cluster**
```shell
eksctl create iamidentitymapping \
--cluster s-eks-ci  \
--region ap-northeast-1 \
--arn arn:aws:iam::234002441930:user/habac.jacie@atware.asia \
--group system:masters \
--no-duplicate-arns \
--username jacie \
--profile atwarevn-dev
```
```shell
flux get kustomizations --watch
flux get helmreleases --all-namespaces
flux logs --all-namespaces --level=error
flux delete helmrelease karpenter --namespace karpenter
kubectl delete helmrelease karpenter -n karpenter
```
```shell
flux create source helm karpenter \
  --url oci://public.ecr.aws/karpenter \
  --namespace karpenter \
  --export > ./clusters/karpenter/karpenter-source.yaml
```

```shell
flux create helmrelease karpenter --chart karpenter \
  --source HelmRepository/karpenter \
  --chart-version v0.27.3 \
  --namespace karpenter \
  --create-target-namespace \
  --export > ./clusters/karpenter/karpenter-release.yaml

```